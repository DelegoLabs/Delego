/**
 * In-page emulator for the Freighter browser-extension bridge (FE-044 / #804).
 *
 * `@stellar/freighter-api@6` talks to the extension in two ways:
 *
 *  1. an injected `window.freighter` marker, which `isConnected()` short-circuits on, and
 *  2. the extension's `window.postMessage` protocol
 *     (`FREIGHTER_EXTERNAL_MSG_REQUEST` → `FREIGHTER_EXTERNAL_MSG_RESPONSE`, see
 *     `sendMessageToContentScript` in the published bundle) for every other call:
 *     `isAllowed`, `getAddress`/`requestAccess`, `getNetwork`, `signTransaction`.
 *
 * `page.addInitScript` can only fake (1). With no content script answering (2),
 * `isAllowed()`/`getAddress()` never settle and `useWallet()` stays in its
 * "Checking wallet…" state forever, so no wallet flow can be driven end to end.
 * Emulating both halves — and nothing else — keeps the checkout flows runnable
 * in CI without installing a browser extension.
 *
 * Deliberately dependency-free and closure-free: Playwright serialises this
 * function's source into the page via `addInitScript`.
 */

export interface FreighterStubOptions {
  /** Address reported by `getAddress()` / `requestAccess()`. */
  address: string;
  /**
   * Whether the origin already has wallet access. Defaults to `false`, i.e. a
   * first-time visitor who has to grant access through the connect CTA.
   */
  allowed?: boolean;
  network?: string;
  networkPassphrase?: string;
  horizonUrl?: string;
  sorobanRpcUrl?: string;
}

export function installFreighterStub(options: FreighterStubOptions): void {
  const address = options.address;
  const network = options.network ?? "TESTNET";
  const networkPassphrase =
    options.networkPassphrase ?? "Test SDF Network ; September 2015";
  const horizonUrl =
    options.horizonUrl ?? "https://horizon-testnet.stellar.org";
  const sorobanRpcUrl =
    options.sorobanRpcUrl ?? "https://soroban-testnet.stellar.org";

  let allowed = options.allowed === true;

  // (1) The marker the SDK's isConnected() reads directly.
  (window as unknown as { freighter: unknown }).freighter = {
    isConnected: async () => ({ isConnected: true }),
    isAllowed: async () => ({ isAllowed: allowed }),
    getAddress: async () => ({ address }),
    getNetwork: async () => ({ network, networkPassphrase }),
    getNetworkDetails: async () => ({
      network,
      networkUrl: horizonUrl,
      networkPassphrase,
      sorobanRpcUrl,
    }),
    requestAccess: async () => {
      allowed = true;
      return { address };
    },
    signTransaction: async () => ({
      signedTxXdr: "MOCK_SIGNED_XDR",
      signerAddress: address,
    }),
  };

  // (2) The extension message protocol. Responses must echo `messagedId`
  // (sic — the typo is in the SDK) and come from this same window.
  window.addEventListener("message", (event: MessageEvent) => {
    // Ignore other windows/frames; a same-window post always carries `source`.
    if (event.source && event.source !== window) return;

    const request = event.data as {
      source?: string;
      messageId?: number;
      type?: string;
    } | null;
    if (!request || request.source !== "FREIGHTER_EXTERNAL_MSG_REQUEST") return;

    const reply = (payload: Record<string, unknown>): void => {
      window.postMessage(
        {
          source: "FREIGHTER_EXTERNAL_MSG_RESPONSE",
          messagedId: request.messageId,
          ...payload,
        },
        window.location.origin
      );
    };

    switch (request.type) {
      case "REQUEST_CONNECTION_STATUS":
        reply({ isConnected: true });
        return;
      case "REQUEST_ALLOWED_STATUS":
        reply({ isAllowed: allowed });
        return;
      case "SET_ALLOWED_STATUS":
        allowed = true;
        reply({ isAllowed: allowed });
        return;
      case "REQUEST_PUBLIC_KEY":
        reply({ publicKey: address });
        return;
      case "REQUEST_ACCESS":
        allowed = true;
        reply({ publicKey: address });
        return;
      case "REQUEST_NETWORK":
        reply({ network, networkPassphrase });
        return;
      case "REQUEST_NETWORK_DETAILS":
        reply({
          networkDetails: {
            network,
            networkName: network === "TESTNET" ? "Testnet" : network,
            networkUrl: horizonUrl,
            networkPassphrase,
            sorobanRpcUrl,
          },
        });
        return;
      case "SUBMIT_TRANSACTION":
        reply({
          signedTransaction: "MOCK_SIGNED_XDR",
          signerAddress: address,
        });
        return;
      default:
        // Unknown method: an empty (but well-formed) response, so the SDK
        // resolves instead of waiting for the 2s fallback timeout.
        reply({});
    }
  });
}
