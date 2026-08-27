export interface WalletNetworkInfo {
  network: string | null;
  networkPassphrase: string | null;
}

export interface SignTransactionOptions {
  networkPassphrase?: string;
  address?: string;
}

/**
 * Thrown by `connect()` when the wallet refused or the user declined access,
 * as opposed to the extension not being present at all. `useWallet` maps this
 * to the "error" status instead of "unavailable".
 */
export class WalletAccessDeniedError extends Error {}

/**
 * Contract every wallet integration implements. `useWallet` drives its whole
 * connection state machine through this interface, so supporting another
 * wallet is one new adapter file plus a registry entry — see
 * docs/wallet-adapters.md.
 */
export interface StellarWalletAdapter {
  /** Stable identifier, persisted per browser as the user's wallet choice. */
  readonly id: string;
  /** Human-readable name shown in the picker and status copy. */
  readonly name: string;
  /** Where to send users who do not have the extension installed. */
  readonly installUrl: string;
  /** Whether the extension is present in this browser. */
  detect(): Promise<boolean>;
  /** Request access, prompting the user if needed; resolves to the address. */
  connect(): Promise<string>;
  /**
   * Silently resolve the connected address. Returns null when the wallet is
   * installed but cannot report an address without prompting the user.
   */
  getAddress(): Promise<string | null>;
  /** Null fields mean the wallet cannot report its network. */
  getNetwork(): Promise<WalletNetworkInfo>;
  /** Sign a transaction XDR and return the signed XDR (FE-013). */
  signTransaction(xdr: string, opts?: SignTransactionOptions): Promise<string>;
  /** Release any adapter-held session state. */
  disconnect(): Promise<void>;
}
