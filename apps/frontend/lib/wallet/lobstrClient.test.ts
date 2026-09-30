import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  postLobstrRequest,
  isLobstrInstalled,
  requestLobstrAccess,
  getCachedLobstrPublicKey,
  signLobstrTransaction,
  clearLobstrSession,
} from "./lobstrClient";

const REQUEST = "LOBSTR_EXTERNAL_MSG_REQUEST";
const RESPONSE = "LOBSTR_EXTERNAL_MSG_RESPONSE";

type Handler = (request: Record<string, unknown>) => Record<string, unknown>;

/** Answers every outgoing request frame as the extension would. */
function fakeExtension(handler: Handler) {
  return vi.spyOn(window, "postMessage").mockImplementation((message) => {
    const request = message as Record<string, unknown>;
    if (request?.source !== REQUEST) return;
    const event = new MessageEvent("message", {
      data: {
        source: RESPONSE,
        // The extension echoes the id under its own (misspelled) key.
        messagedId: request.messageId,
        ...handler(request),
      },
    });
    Object.defineProperty(event, "source", { value: window });
    window.dispatchEvent(event);
  });
}

describe("lobstrClient", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    delete window.lobstrSignerExtension;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("posts a tagged request frame and resolves with the response body", async () => {
    const post = vi.spyOn(window, "postMessage").mockImplementation(() => {});

    const promise = postLobstrRequest({ type: "REQUEST_ACCESS", version: 1 });

    expect(post).toHaveBeenCalledTimes(1);
    const [message, targetOrigin] = post.mock.calls[0] as [unknown, string];
    const request = message as Record<string, unknown>;
    expect(request.source).toBe(REQUEST);
    expect(request.type).toBe("REQUEST_ACCESS");
    expect(typeof request.messageId).toBe("string");
    expect(targetOrigin).toBe(window.location.origin);

    const event = new MessageEvent("message", {
      data: {
        source: RESPONSE,
        messagedId: request.messageId,
        publicKey: "GABC123",
      },
    });
    Object.defineProperty(event, "source", { value: window });
    window.dispatchEvent(event);

    await expect(promise).resolves.toEqual({ publicKey: "GABC123" });
  });

  it("ignores unrelated message events until its own answer arrives", async () => {
    const post = vi.spyOn(window, "postMessage").mockImplementation(() => {});
    const promise = postLobstrRequest({ type: "REQUEST_ACCESS", version: 1 });
    const request = post.mock.calls[0][0] as Record<string, unknown>;

    const send = (data: Record<string, unknown>) => {
      const event = new MessageEvent("message", { data });
      Object.defineProperty(event, "source", { value: window });
      window.dispatchEvent(event);
    };

    send({ source: RESPONSE, messagedId: "someone-else", publicKey: "GOTHER" });
    send({ source: "NOT_OURS", messageId: request.messageId });
    send({ source: RESPONSE, messagedId: "not-the-echoed-id", publicKey: "G2" });
    // Answer with the correctly spelled key — the misspelling is the default.
    send({ source: RESPONSE, messageId: request.messageId, publicKey: "GABC123" });

    await expect(promise).resolves.toEqual({ publicKey: "GABC123" });
  });

  describe("with fake timers", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    it("rejects a request when nothing answers in time", async () => {
      vi.spyOn(window, "postMessage").mockImplementation(() => {});

      const promise = postLobstrRequest({ type: "REQUEST_ACCESS" }, 500);
      const expectation = expect(promise).rejects.toThrow(
        /reach the LOBSTR extension/
      );
      await vi.advanceTimersByTimeAsync(500);
      await expectation;
    });

    it("treats a silent extension as not installed", async () => {
      vi.spyOn(window, "postMessage").mockImplementation(() => {});

      const promise = isLobstrInstalled();
      await vi.advanceTimersByTimeAsync(2000);
      await expect(promise).resolves.toBe(false);
    });
  });

  describe("isLobstrInstalled", () => {
    it("trusts the injected flag without posting anything", async () => {
      const post = vi.spyOn(window, "postMessage");
      window.lobstrSignerExtension = true;

      await expect(isLobstrInstalled()).resolves.toBe(true);
      expect(post).not.toHaveBeenCalled();
    });

    it("asks the extension whether it is connected", async () => {
      fakeExtension(() => ({ isConnected: true }));

      await expect(isLobstrInstalled()).resolves.toBe(true);
    });

    it("reports a non-connected extension as not usable", async () => {
      fakeExtension(() => ({ isConnected: false }));

      await expect(isLobstrInstalled()).resolves.toBe(false);
    });
  });

  describe("requestLobstrAccess", () => {
    it("caches the public key and connection token", async () => {
      fakeExtension(() => ({
        publicKey: "GLOBSTR123",
        connectionKey: "connection-token",
      }));

      await expect(requestLobstrAccess()).resolves.toBe("GLOBSTR123");
      expect(getCachedLobstrPublicKey()).toBe("GLOBSTR123");
      expect(window.sessionStorage.getItem("LOBSTR_CONNECTION_KEY")).toBe(
        "connection-token"
      );
    });

    it("throws the extension's message when access is declined", async () => {
      fakeExtension(() => ({ error: "User declined the request" }));

      await expect(requestLobstrAccess()).rejects.toThrow(
        "User declined the request"
      );
      expect(getCachedLobstrPublicKey()).toBeNull();
    });

    it("explains when no wallet is linked yet", async () => {
      fakeExtension(() => ({ publicKey: "" }));

      await expect(requestLobstrAccess()).rejects.toThrow(
        /No LOBSTR wallet is linked/
      );
    });
  });

  describe("signLobstrTransaction", () => {
    it("refuses to sign without a connection token", async () => {
      await expect(signLobstrTransaction("xdr-blob")).rejects.toThrow(
        "Connect LOBSTR before signing a transaction."
      );
    });

    it("signs through the extension once connected", async () => {
      window.sessionStorage.setItem("LOBSTR_CONNECTION_KEY", "connection-token");
      const post = vi.spyOn(window, "postMessage").mockImplementation(() => {
        const event = new MessageEvent("message", {
          data: {
            source: RESPONSE,
            messagedId: (
              post.mock.calls[post.mock.calls.length - 1][0] as Record<
                string,
                unknown
              >
            ).messageId,
            signedData: "AAAA-SIGNED",
          },
        });
        Object.defineProperty(event, "source", { value: window });
        window.dispatchEvent(event);
      });

      await expect(signLobstrTransaction("xdr-blob")).resolves.toBe(
        "AAAA-SIGNED"
      );

      const request = post.mock.calls[0][0] as Record<string, unknown>;
      expect(request.type).toBe("SIGN");
      expect(request.dataToSign).toBe("xdr-blob");
      expect(request.connectionKey).toBe("connection-token");
    });

    it("surfaces a rejected signature", async () => {
      window.sessionStorage.setItem("LOBSTR_CONNECTION_KEY", "connection-token");
      fakeExtension(() => ({ error: "Signature rejected" }));

      await expect(signLobstrTransaction("xdr-blob")).rejects.toThrow(
        "Signature rejected"
      );
    });
  });

  describe("clearLobstrSession", () => {
    it("forgets the cached key and connection token", () => {
      window.sessionStorage.setItem("LOBSTR_CONNECTION_KEY", "token");
      window.sessionStorage.setItem("delego_lobstr_public_key", "GABC");

      clearLobstrSession();

      expect(window.sessionStorage.getItem("LOBSTR_CONNECTION_KEY")).toBeNull();
      expect(getCachedLobstrPublicKey()).toBeNull();
    });
  });
});
