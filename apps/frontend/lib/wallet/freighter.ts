import {
  WalletAccessDeniedError,
  type StellarWalletAdapter,
} from "./types";

/**
 * Freighter only exists in the browser, so `@stellar/freighter-api` is
 * dynamically imported exactly as the previous Freighter-only hook did.
 * Call order and error mapping are preserved verbatim from that hook.
 */
export const freighterAdapter: StellarWalletAdapter = {
  id: "freighter",
  name: "Freighter",
  installUrl: "https://www.freighter.app/",

  async detect() {
    const freighter = await import("@stellar/freighter-api");
    const connected = await freighter.isConnected();
    return !connected.error && connected.isConnected;
  },

  async connect() {
    const freighter = await import("@stellar/freighter-api");
    const access = await freighter.requestAccess();
    if (access.error || !access.address) {
      throw new WalletAccessDeniedError(
        access.error?.message ?? "Wallet access was denied"
      );
    }
    return access.address;
  },

  async getAddress() {
    const freighter = await import("@stellar/freighter-api");
    const allowed = await freighter.isAllowed();
    if (allowed.error || !allowed.isAllowed) {
      return null;
    }
    const addressRes = await freighter.getAddress();
    if (addressRes.error || !addressRes.address) {
      throw new Error(
        addressRes.error?.message ??
          "Couldn't read the wallet address. Please try again."
      );
    }
    return addressRes.address;
  },

  async getNetwork() {
    const freighter = await import("@stellar/freighter-api");
    const net = await freighter.getNetwork();
    return {
      network: net.error ? null : net.network,
      networkPassphrase: net.error ? null : net.networkPassphrase,
    };
  },

  async signTransaction(xdr, opts) {
    const freighter = await import("@stellar/freighter-api");
    const signed = await freighter.signTransaction(xdr, opts);
    if (signed.error || !signed.signedTxXdr) {
      throw new Error(signed.error?.message ?? "Transaction signing failed");
    }
    return signed.signedTxXdr;
  },

  async disconnect() {
    // Freighter has no revoke API; the hook resets its local state.
  },
};
