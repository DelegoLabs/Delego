/**
 * Tests for issue #215 — User Lookup Adapter for Wallet Address
 *
 * Covers:
 *  - Found wallet address → returns WalletNotificationTarget
 *  - Missing wallet address → returns null (does NOT throw)
 *  - Empty / invalid inputs → returns null (does NOT throw)
 *  - Push enabled when Redis scard > 0
 *  - Push disabled when Redis scard === 0
 *  - DB error → returns null (worker-wide error isolation)
 */
import { describe, it, expect, vi } from "vitest";
import {
  DbWalletLookupAdapter,
  type DbClient,
  type RedisClient,
  type WalletNotificationTarget,
} from "./walletLookup.js";

// ── Stub helpers ─────────────────────────────────────────────────────────────

const WALLET_ADDRESS = "GBBO4ZDDZTSM2GKN4JP4EKBPRXKEHUN36XXH2BHR7J4QKKPOJ7C7LDVF";

function makeDb(row: { user_id: string; email: string | null } | null): DbClient {
  return {
    queryOne: vi.fn().mockResolvedValue(row),
  };
}

function makeRedis(scardResult: number): RedisClient {
  return {
    scard: vi.fn().mockResolvedValue(scardResult),
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("DbWalletLookupAdapter (issue #215)", () => {
  // ── Success: found ──────────────────────────────────────────────────────────

  it("returns WalletNotificationTarget when wallet address is found", async () => {
    const db = makeDb({ user_id: "user-abc", email: "alice@example.com" });
    const redis = makeRedis(2); // 2 push subscriptions
    const adapter = new DbWalletLookupAdapter(db, redis);

    const result = await adapter.lookupByWalletAddress(WALLET_ADDRESS);

    expect(result).not.toBeNull();
    const target = result as WalletNotificationTarget;
    expect(target.walletAddress).toBe(WALLET_ADDRESS);
    expect(target.userId).toBe("user-abc");
    expect(target.email).toBe("alice@example.com");
    expect(target.pushEnabled).toBe(true);
  });

  it("sets pushEnabled to true when user has at least one push subscription", async () => {
    const db = makeDb({ user_id: "user-push", email: null });
    const redis = makeRedis(1);
    const adapter = new DbWalletLookupAdapter(db, redis);

    const result = await adapter.lookupByWalletAddress(WALLET_ADDRESS);
    expect(result?.pushEnabled).toBe(true);
  });

  it("sets pushEnabled to false when user has no push subscriptions", async () => {
    const db = makeDb({ user_id: "user-nopush", email: "bob@example.com" });
    const redis = makeRedis(0);
    const adapter = new DbWalletLookupAdapter(db, redis);

    const result = await adapter.lookupByWalletAddress(WALLET_ADDRESS);
    expect(result?.pushEnabled).toBe(false);
  });

  it("leaves email undefined when the DB row has a null email", async () => {
    const db = makeDb({ user_id: "user-noemail", email: null });
    const redis = makeRedis(0);
    const adapter = new DbWalletLookupAdapter(db, redis);

    const result = await adapter.lookupByWalletAddress(WALLET_ADDRESS);
    expect(result?.email).toBeUndefined();
  });

  it("trims whitespace from the wallet address before querying", async () => {
    const db = makeDb({ user_id: "user-trim", email: null });
    const redis = makeRedis(0);
    const adapter = new DbWalletLookupAdapter(db, redis);

    const result = await adapter.lookupByWalletAddress(`  ${WALLET_ADDRESS}  `);
    expect(result?.walletAddress).toBe(WALLET_ADDRESS);
  });

  // ── Missing user ───────────────────────────────────────────────────────────

  it("returns null when no user is associated with the wallet address", async () => {
    const db = makeDb(null);
    const redis = makeRedis(0);
    const adapter = new DbWalletLookupAdapter(db, redis);

    const result = await adapter.lookupByWalletAddress(WALLET_ADDRESS);
    expect(result).toBeNull();
  });

  // ── Invalid input ──────────────────────────────────────────────────────────

  it("returns null (does not throw) for an empty wallet address", async () => {
    const db = makeDb(null);
    const redis = makeRedis(0);
    const adapter = new DbWalletLookupAdapter(db, redis);

    const result = await adapter.lookupByWalletAddress("");
    expect(result).toBeNull();
  });

  it("returns null (does not throw) for a whitespace-only address", async () => {
    const db = makeDb(null);
    const redis = makeRedis(0);
    const adapter = new DbWalletLookupAdapter(db, redis);

    const result = await adapter.lookupByWalletAddress("   ");
    expect(result).toBeNull();
  });

  // ── Error isolation ────────────────────────────────────────────────────────

  it("returns null (does not throw) when the DB query rejects", async () => {
    const db: DbClient = {
      queryOne: vi.fn().mockRejectedValue(new Error("DB connection timeout")),
    };
    const redis = makeRedis(0);
    const adapter = new DbWalletLookupAdapter(db, redis);

    const result = await adapter.lookupByWalletAddress(WALLET_ADDRESS);
    expect(result).toBeNull();
  });

  it("still returns a target (pushEnabled=false) when Redis scard throws", async () => {
    const db = makeDb({ user_id: "user-redisFail", email: "charlie@example.com" });
    const redis: RedisClient = {
      scard: vi.fn().mockRejectedValue(new Error("Redis timeout")),
    };
    const adapter = new DbWalletLookupAdapter(db, redis);

    // Push check is best-effort; the user target should still be returned
    const result = await adapter.lookupByWalletAddress(WALLET_ADDRESS);
    expect(result).not.toBeNull();
    expect(result?.pushEnabled).toBe(false);
  });
});
