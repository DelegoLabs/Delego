/**
 * Wallet adapter contract (#736) — the seam between the app and a Stellar
 * wallet browser extension.
 *
 * The app never talks to an extension SDK directly: it resolves an adapter
 * from `lib/wallet/registry.ts` and calls this interface. Freighter is the
 * first adapter, LOBSTR the second, and adding a third one is a single new
 * file plus a one-line registry entry (see docs/wallet-adapters.md).
 *
 * `signTransaction` is the hook FE-013 (client-side Soroban signing for
 * escrow release and approval confirmations) signs through: callers receive
 * it from `useWallet().signTransaction`, which always delegates to the
 * currently selected adapter.
 */

/** Stable identifier persisted as the user's per-browser wallet choice. */
export type WalletId = string;

/** Network details reported by a wallet, when the wallet exposes them. */
export interface WalletNetworkInfo {
  /** Wallet's own network label — Freighter reports `TESTNET` / `PUBLIC`. */
  network: string | null;
  /** Passphrase used when signing — drives `useNetworkMismatch`. */
  networkPassphrase: string | null;
}

/**
 * Thrown by `connect()` when the user (or their wallet) declined the access
 * prompt. Mapped to the `error` connection status — as opposed to a missing
 * extension, which maps to `unavailable`.
 */
export class WalletAccessDeniedError extends Error {
  constructor(message = "Wallet access was denied") {
    super(message);
    this.name = "WalletAccessDeniedError";
  }
}

/**
 * Normalizes the varied error shapes extensions return (string, `{message}`,
 * plain `Error`) into an `Error` so callers can rely on `err.message`.
 */
export function toWalletError(
  value: unknown,
  fallback: string
): Error {
  if (value instanceof Error) return value;
  if (typeof value === "string" && value.trim()) return new Error(value);
  if (value && typeof value === "object" && "message" in value) {
    const message = (value as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return new Error(message);
  }
  return new Error(fallback);
}

/**
 * A wallet the app can connect to.
 *
 * Lifecycle used by `useWallet`:
 * 1. `detect()` — is the extension installed? Drives the picker's
 *    "not installed → install link" state. Never prompts the user.
 * 2. `connect()` — prompts for access, resolves with the authorized public
 *    key, or rejects with {@link WalletAccessDeniedError} / a plain `Error`.
 * 3. `getAddress()` / `getNetwork()` — passive re-reads on every refresh;
 *    `getAddress()` resolving `null` means "installed but not authorized
 *    yet" (the `disconnected` status), rejecting surfaces the message as
 *    the `error` status.
 * 4. `signTransaction(xdr)` — returns the signed envelope (FE-013).
 * 5. `disconnect()` — revokes whatever session the adapter holds.
 */
export interface StellarWalletAdapter {
  /** Stable id — persisted in localStorage as the selected wallet. */
  readonly id: WalletId;
  /** Display name shown in the wallet picker, e.g. `Freighter`. */
  readonly name: string;
  /** Install/download page linked from the picker when not installed. */
  readonly installUrl: string;
  /** Whether the extension is available. Must never prompt the user. */
  detect(): Promise<boolean>;
  /**
   * Prompts for access and resolves with the authorized public key.
   * @throws {WalletAccessDeniedError} the user declined the prompt
   * @throws {Error} the extension is missing or the request failed
   */
  connect(): Promise<string>;
  /** Authorized public key, or `null` when the wallet is not authorized yet. */
  getAddress(): Promise<string | null>;
  /** Active network, or `null` when the wallet does not expose one. */
  getNetwork(): Promise<WalletNetworkInfo | null>;
  /** Signs a transaction envelope and resolves with the signed envelope. */
  signTransaction(xdr: string): Promise<string>;
  /** Revokes the dApp session (may be a no-op — Freighter has none). */
  disconnect(): void | Promise<void>;
  /**
   * Optional: subscribe to account/network changes in the extension.
   * Returns a cleanup function (or a promise of one). Adapters without
   * change events simply omit it — `useWallet` feature-detects it.
   */
  subscribe?(onChange: () => void): Promise<(() => void) | void> | (() => void) | void;
}
