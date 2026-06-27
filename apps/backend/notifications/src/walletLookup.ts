/**
 * Wallet Notification Lookup Adapter — Issue #215
 *
 * Resolves a Stellar wallet address to a {@link WalletNotificationTarget} so
 * that payment-event workers can determine *who* to notify without knowing
 * the details of the user or wallet storage layer.
 *
 * Design goals:
 *  - Missing users are represented as `null`, never thrown, so a single
 *    unresolvable address never crashes a batch notification worker.
 *  - The {@link WalletLookupAdapter} interface is kept thin so tests can
 *    inject lightweight stubs without a real database.
 *  - The {@link DbWalletLookupAdapter} is the production implementation that
 *    queries the notifications service's own read replica (or the shared
 *    PostgreSQL instance exposed via env-var).
 */

import { createRequire } from "node:module";
import { createLogger } from "@delego/utils";

const log = createLogger(
  "notifications:walletLookup",
  process.env.LOG_LEVEL ?? "info"
);

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * The resolved notification target for a Stellar wallet address.
 *
 * `pushEnabled` is `true` when the user has at least one active push
 * subscription stored in Redis.
 */
export interface WalletNotificationTarget {
  walletAddress: string;
  userId: string;
  email?: string;
  pushEnabled: boolean;
}

/**
 * Adapter interface — implement this to swap out the storage layer in tests.
 */
export interface WalletLookupAdapter {
  /**
   * Look up the notification target for the given Stellar wallet address.
   *
   * @returns `null` when the address is not associated with any known user,
   *          so callers can skip notification without throwing.
   */
  lookupByWalletAddress(
    walletAddress: string
  ): Promise<WalletNotificationTarget | null>;
}

// ---------------------------------------------------------------------------
// Database-backed implementation
// ---------------------------------------------------------------------------

/**
 * PostgreSQL-backed adapter that resolves a wallet address via the
 * `wallets` → `users` join that already exists in the shared schema.
 *
 * The adapter is intentionally read-only and uses a raw parameterised query
 * to avoid pulling in the full Sequelize model graph inside the notifications
 * service.
 */
export class DbWalletLookupAdapter implements WalletLookupAdapter {
  private readonly redisSubscriptionKey = "push:subscriptions";

  constructor(
    private readonly db: DbClient,
    private readonly redis: RedisClient
  ) {}

  async lookupByWalletAddress(
    walletAddress: string
  ): Promise<WalletNotificationTarget | null> {
    if (!walletAddress || walletAddress.trim() === "") {
      log.warn("lookupByWalletAddress called with empty address");
      return null;
    }

    try {
      const row = await this.db.queryOne<{
        user_id: string;
        email: string | null;
      }>(
        `SELECT u.id AS user_id, u.email
         FROM wallets w
         JOIN users u ON u.id = w.user_id
         WHERE w.stellar_address = $1
         LIMIT 1`,
        [walletAddress.trim()]
      );

      if (!row) {
        log.info("No user found for wallet address", { walletAddress });
        return null;
      }

      const pushEnabled = await this.hasPushSubscriptions(row.user_id);

      return {
        walletAddress: walletAddress.trim(),
        userId: row.user_id,
        email: row.email ?? undefined,
        pushEnabled,
      };
    } catch (err) {
      // Log but return null so a single DB error never cascades to the
      // calling worker — matches the "no throwing" acceptance criterion.
      log.error("Failed to lookup wallet address", {
        walletAddress,
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }

  private async hasPushSubscriptions(userId: string): Promise<boolean> {
    try {
      const count = await this.redis.scard(
        `${this.redisSubscriptionKey}:${userId}`
      );
      return count > 0;
    } catch {
      // Push subscription check is best-effort; default to false.
      return false;
    }
  }
}

// ---------------------------------------------------------------------------
// Minimal DB / Redis interfaces (allows lightweight test stubs)
// ---------------------------------------------------------------------------

export interface DbClient {
  queryOne<T>(sql: string, params?: unknown[]): Promise<T | null>;
}

export interface RedisClient {
  scard(key: string): Promise<number>;
}

// ---------------------------------------------------------------------------
// Default singleton (lazy-initialised for production use)
// ---------------------------------------------------------------------------

let _defaultAdapter: WalletLookupAdapter | null = null;

/**
 * Returns the default production adapter.  The adapter is created lazily on
 * first call so the module can be imported without a live database.
 *
 * Provide a custom adapter via `setWalletLookupAdapter` in tests.
 */
export function getWalletLookupAdapter(): WalletLookupAdapter {
  if (_defaultAdapter) return _defaultAdapter;

  // Use createRequire so this ESM module can safely load the CJS builds of
  // pg and ioredis without needing a static import at the top of the file
  // (which would force a real DB/Redis connection on every module load).
  const _require = createRequire(import.meta.url);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { Pool } = _require("pg") as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { Redis } = _require("ioredis") as any;

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");

  const dbClient: DbClient = {
    async queryOne<T>(sql: string, params?: unknown[]): Promise<T | null> {
      const { rows } = await pool.query(sql, params);
      return (rows[0] as T) ?? null;
    },
  };

  _defaultAdapter = new DbWalletLookupAdapter(dbClient, redis);
  return _defaultAdapter;
}

/** Override the default adapter — use in unit tests. */
export function setWalletLookupAdapter(adapter: WalletLookupAdapter): void {
  _defaultAdapter = adapter;
}

/** Reset to force lazy re-initialisation — call in afterEach. */
export function resetWalletLookupAdapter(): void {
  _defaultAdapter = null;
}
