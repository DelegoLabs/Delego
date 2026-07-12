import { createRequire } from "node:module";
import { rpc as SorobanRpc } from "@stellar/stellar-sdk";
import { createLogger } from "@delego/utils";
import { getWalletUrl } from "./config.js";

const log = createLogger("payments:escrow:health", process.env.LOG_LEVEL ?? "info");

export interface PaymentsHealth {
  database: string;
  walletService: string;
  sorobanRpc: string;
  checkedAt: string;
}

export type DependencyStatus = "ok" | "degraded";

const DEFAULT_TIMEOUT_MS = 2000;

export function getDatabaseUrl(): string {
  return process.env.DATABASE_URL ?? "postgresql://delego:delego@localhost:5432/delego";
}

export function getSorobanRpcUrl(): string {
  if (process.env.SOROBAN_RPC_URL) {
    return process.env.SOROBAN_RPC_URL;
  }

  const network = (process.env.STELLAR_NETWORK ?? "testnet").toLowerCase();
  if (network === "mainnet") {
    return "https://soroban-rpc.mainnet.stellar.org";
  }
  return "https://soroban-testnet.stellar.org";
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  let timeoutId: NodeJS.Timeout | null = null;

  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error(`${label} health check timeout`)),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

export async function checkDatabaseConnectivity(
  databaseUrl: string = getDatabaseUrl(),
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<DependencyStatus> {
  const require = createRequire(import.meta.url);
  const { Pool } = require("pg") as typeof import("pg");
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });

  try {
    await withTimeout(pool.query("SELECT 1"), timeoutMs, "Database");
    return "ok";
  } catch (err) {
    log.warn(
      "Database health check failed",
      err instanceof Error ? { error: err.message } : { error: String(err) },
    );
    return "degraded";
  } finally {
    await pool.end().catch(() => undefined);
  }
}

export async function checkWalletServiceReadiness(
  walletUrl: string = getWalletUrl(),
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
  fetchFn: typeof fetch = fetch,
): Promise<DependencyStatus> {
  const url = `${walletUrl.replace(/\/$/, "")}/health`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetchFn(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) {
      return "degraded";
    }

    const body = (await response.json()) as { data?: { status?: string } };
    return body.data?.status === "ok" ? "ok" : "degraded";
  } catch (err) {
    log.warn(
      "Wallet service health check failed",
      err instanceof Error ? { error: err.message } : { error: String(err) },
    );
    return "degraded";
  }
}

export async function checkSorobanRpcReadiness(
  rpcUrl: string = getSorobanRpcUrl(),
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<DependencyStatus> {
  const server = new SorobanRpc.Server(rpcUrl);

  try {
    await withTimeout(server.getHealth(), timeoutMs, "Soroban RPC");
    return "ok";
  } catch (err) {
    log.warn(
      "Soroban RPC health check failed",
      err instanceof Error ? { error: err.message } : { error: String(err) },
    );
    return "degraded";
  }
}

export interface PaymentsHealthOptions {
  databaseUrl?: string;
  walletUrl?: string;
  sorobanRpcUrl?: string;
  timeoutMs?: number;
  fetchFn?: typeof fetch;
  checkDatabase?: () => Promise<DependencyStatus>;
  checkWallet?: () => Promise<DependencyStatus>;
  checkSorobanRpc?: () => Promise<DependencyStatus>;
}

export async function getPaymentsHealth(
  options: PaymentsHealthOptions = {},
): Promise<PaymentsHealth> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const [database, walletService, sorobanRpc] = await Promise.all([
    options.checkDatabase?.() ??
      checkDatabaseConnectivity(options.databaseUrl, timeoutMs),
    options.checkWallet?.() ??
      checkWalletServiceReadiness(options.walletUrl, timeoutMs, options.fetchFn),
    options.checkSorobanRpc?.() ??
      checkSorobanRpcReadiness(options.sorobanRpcUrl, timeoutMs),
  ]);

  return {
    database,
    walletService,
    sorobanRpc,
    checkedAt: new Date().toISOString(),
  };
}
