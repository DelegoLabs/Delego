import {
  WalletAccessDeniedError,
  type StellarWalletAdapter,
} from "./types";

/**
 * LOBSTR's extension API surface is only isConnected/getPublicKey/
 * signTransaction: it cannot report its network and has no silent address
 * read. A persisted LOBSTR session therefore resumes as "disconnected" until
 * the user reconnects, and network checks take the app's "cannot determine"
 * path. See docs/wallet-adapters.md.
 */
export const lobstrAdapter: StellarWalletAdapter = {
  id: "lobstr",
  name: "LOBSTR",
  installUrl: "https://lobstr.co/signer-extension/",

  async detect() {
    const lobstr = await import("@lobstrco/signer-extension-api");
    try {
      return Boolean(await lobstr.isConnected());
    } catch {
      return false;
    }
  },

  async connect() {
    const lobstr = await import("@lobstrco/signer-extension-api");
    // getPublicKey never settles when the extension is absent, so gate on
    // the availability handshake (which does time out) first.
    let present: boolean;
    try {
      present = Boolean(await lobstr.isConnected());
    } catch {
      present = false;
    }
    if (!present) {
      throw new Error(
        "LOBSTR extension not found. Install it to connect your wallet."
      );
    }
    let publicKey: string;
    try {
      publicKey = await lobstr.getPublicKey();
    } catch (err) {
      throw new WalletAccessDeniedError(
        err instanceof Error && err.message
          ? err.message
          : "Wallet access was denied"
      );
    }
    if (!publicKey) {
      throw new WalletAccessDeniedError("Wallet access was denied");
    }
    return publicKey;
  },

  async getAddress() {
    // getPublicKey may prompt, so a background refresh must not call it.
    return null;
  },

  async getNetwork() {
    return { network: null, networkPassphrase: null };
  },

  async signTransaction(xdr) {
    const lobstr = await import("@lobstrco/signer-extension-api");
    return lobstr.signTransaction(xdr);
  },

  async disconnect() {
    // LOBSTR has no revoke API; the hook resets its local state.
  },
};
