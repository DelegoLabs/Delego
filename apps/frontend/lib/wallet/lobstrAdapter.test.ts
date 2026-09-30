import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { lobstrAdapter } from "./lobstrAdapter";
import { WalletAccessDeniedError } from "./types";

const REQUEST = "LOBSTR_EXTERNAL_MSG_REQUEST";
const RESPONSE = "LOBSTR_EXTERNAL_MSG_RESPONSE";

interface FakeOptions {
  connected?: boolean;
  access?: () => Record<string, unknown>;
  sign?: () => Record<string, unknown>;
}

/** Answers install probes, access prompts, and signing requests. */
function fakeExtension(options: FakeOptions = {}) {
  const { connected = true, access, sign } = options;
  return vi.spyOn(window, "postMessage").mockImplementation((message) => {
    const request = message as Record<string, unknown>;
    if (request?.source !== REQUEST) return;

    const payload =
      request.type === "REQUEST_CONNECTION_STATUS"
        ? { isConnected: connected }
        : request.type === "REQUEST_ACCESS"
          ? access
            ? access()
            : { publicKey: "GLOBSTR123", connectionKey: "token-1" }
          : request.type === "SIGN"
            ? sign
              ? sign()
              : { signedData: "AAAA-SIGNED" }
            : undefined;

    if (!payload) return;

    const event = new MessageEvent("message", {
      data: {
        source: RESPONSE,
        messagedId: request.messageId,
        ...payload,
      },
    });
    Object.defineProperty(event, "source", { value: window });
    window.dispatchEvent(event);
  });
}

describe("lobstrAdapter", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    delete window.lobstrSignerExtension;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("identifies itself for the picker", () => {
    expect(lobstrAdapter.id).toBe("lobstr");
    expect(lobstrAdapter.name).toBe("LOBSTR");
    expect(lobstrAdapter.installUrl).toBe("https://lobstr.co/signer-extension");
  });

  describe("detect", () => {
    it("is true when the extension injected its flag", async () => {
      window.lobstrSignerExtension = true;

      await expect(lobstrAdapter.detect()).resolves.toBe(true);
    });

    it("probes the extension when no flag was injected", async () => {
      fakeExtension({ connected: true });
      await expect(lobstrAdapter.detect()).resolves.toBe(true);

      vi.restoreAllMocks();
      fakeExtension({ connected: false });
      await expect(lobstrAdapter.detect()).resolves.toBe(false);
    });
  });

  describe("connect", () => {
    it("explains that the extension is missing instead of prompting", async () => {
      fakeExtension({ connected: false });

      await expect(lobstrAdapter.connect()).rejects.toThrow(
        "LOBSTR extension not found. Install it to connect your wallet."
      );
    });

    it("returns the authorized public key and caches it", async () => {
      fakeExtension();

      await expect(lobstrAdapter.connect()).resolves.toBe("GLOBSTR123");
      await expect(lobstrAdapter.getAddress()).resolves.toBe("GLOBSTR123");
    });

    it("maps a declined prompt to a wallet access error", async () => {
      fakeExtension({ access: () => ({ error: "User declined the request" }) });

      await expect(lobstrAdapter.connect()).rejects.toBeInstanceOf(
        WalletAccessDeniedError
      );
      await expect(lobstrAdapter.connect()).rejects.toThrow(
        "User declined the request"
      );
    });
  });

  describe("getAddress", () => {
    it("reads the cached key without prompting the extension", async () => {
      const post = fakeExtension();
      await lobstrAdapter.connect();
      const promptsAfterConnect = post.mock.calls.length;

      await expect(lobstrAdapter.getAddress()).resolves.toBe("GLOBSTR123");
      expect(post.mock.calls.length).toBe(promptsAfterConnect);
    });

    it("is null before the first successful connect", async () => {
      await expect(lobstrAdapter.getAddress()).resolves.toBeNull();
    });
  });

  it("reports no network — the signer API does not expose one", async () => {
    await expect(lobstrAdapter.getNetwork()).resolves.toBeNull();
  });

  describe("signTransaction", () => {
    it("refuses to sign before connecting", async () => {
      await expect(lobstrAdapter.signTransaction("xdr-blob")).rejects.toThrow(
        "Connect LOBSTR before signing a transaction."
      );
    });

    it("signs once a session exists", async () => {
      fakeExtension();
      await lobstrAdapter.connect();

      await expect(lobstrAdapter.signTransaction("xdr-blob")).resolves.toBe(
        "AAAA-SIGNED"
      );
    });
  });

  it("disconnect drops the cached session", async () => {
    fakeExtension();
    await lobstrAdapter.connect();

    lobstrAdapter.disconnect();

    await expect(lobstrAdapter.getAddress()).resolves.toBeNull();
    expect(window.sessionStorage.getItem("LOBSTR_CONNECTION_KEY")).toBeNull();
  });
});
