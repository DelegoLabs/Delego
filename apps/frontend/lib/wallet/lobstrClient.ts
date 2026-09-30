/**
 * Minimal client for the LOBSTR signer extension's external message
 * protocol.
 *
 * The extension listens for `window.postMessage` frames tagged
 * `LOBSTR_EXTERNAL_MSG_REQUEST` and replies with `LOBSTR_EXTERNAL_MSG_RESPONSE`
 * frames echoing the request's `messageId` (the extension misspells it
 * `messagedId` in the response — both spellings are accepted here). This is
 * the same wire protocol `@lobstrco/signer-extension-api` speaks; keeping a
 * local copy avoids adding a runtime dependency for four calls, and lets the
 * adapter be unit-tested with synthetic response messages.
 *
 * Reference: https://github.com/Lobstrco/lobstr-browser-extension
 * (the client-facing SDK is Apache-2.0 and documents these messages).
 */

const EXTERNAL_MSG_REQUEST = "LOBSTR_EXTERNAL_MSG_REQUEST";
const EXTERNAL_MSG_RESPONSE = "LOBSTR_EXTERNAL_MSG_RESPONSE";

/** `API_VERSION.V2` from the extension's shared constants. */
const API_VERSION_V2 = 1;

/** How long to wait for an install probe before assuming "not installed". */
const CONNECTION_STATUS_TIMEOUT_MS = 2000;

/** sessionStorage key used by the official SDK for the session token. */
const CONNECTION_KEY = "LOBSTR_CONNECTION_KEY";

/** Our sessionStorage cache of the authorized public key (see `getAddress`). */
const PUBLIC_KEY_CACHE_KEY = "delego_lobstr_public_key";

interface LobstrResponseBody {
  error?: unknown;
  isConnected?: boolean;
  publicKey?: string;
  connectionKey?: string;
  signedData?: string;
  signerAddress?: string;
  [key: string]: unknown;
}

declare global {
  interface Window {
    /** Set by the LOBSTR content script when the extension is present. */
    lobstrSignerExtension?: boolean;
    lobstrSignerExtensionApi?: Record<string, unknown>;
  }
}

function hasSessionStorage(): boolean {
  return (
    typeof window !== "undefined" && typeof window.sessionStorage !== "undefined"
  );
}

function readSession(key: string): string | null {
  if (!hasSessionStorage()) return null;
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeSession(key: string, value: string): void {
  if (!hasSessionStorage()) return;
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // Storage can be unavailable (private mode); the connection then simply
    // does not survive a reload.
  }
}

function removeSession(key: string): void {
  if (!hasSessionStorage()) return;
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // See writeSession — nothing to fall back to.
  }
}

/** Normalizes the extension's error shapes (string, `{message}`, `Error`). */
function responseError(body: LobstrResponseBody, fallback: string): Error {
  const value = body.error;
  if (value instanceof Error) return value;
  if (typeof value === "string" && value.trim()) return new Error(value);
  if (value && typeof value === "object" && "message" in value) {
    const message = (value as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return new Error(message);
  }
  return new Error(fallback);
}

/**
 * Posts one request to the extension and resolves with its response body.
 * Resolves/rejects on the matching response only — unrelated `message`
 * events on the page are ignored.
 */
export function postLobstrRequest(
  payload: Record<string, unknown>,
  timeoutMs?: number
): Promise<LobstrResponseBody> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") {
      reject(new Error("The LOBSTR extension is not available here."));
      return;
    }

    const messageId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const cleanup = () => {
      window.removeEventListener("message", onMessage);
      if (timeoutId !== undefined) clearTimeout(timeoutId);
    };

    const onMessage = (event: MessageEvent) => {
      if (event.source !== window) return;
      const data = event.data as Record<string, unknown> | undefined;
      if (!data || data.source !== EXTERNAL_MSG_RESPONSE) return;
      const echoedId = data.messagedId ?? data.messageId;
      if (echoedId !== messageId) return;

      cleanup();
      const rest: Record<string, unknown> = { ...data };
      delete rest.source;
      delete rest.messagedId;
      delete rest.messageId;
      resolve(rest as LobstrResponseBody);
    };

    window.addEventListener("message", onMessage);

    if (timeoutMs) {
      timeoutId = setTimeout(() => {
        cleanup();
        reject(
          new Error(
            "Couldn't reach the LOBSTR extension. Check that it is installed, then try again."
          )
        );
      }, timeoutMs);
    }

    try {
      window.postMessage(
        { source: EXTERNAL_MSG_REQUEST, messageId, ...payload },
        window.location.origin
      );
    } catch (err) {
      cleanup();
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
}

/**
 * Whether the LOBSTR signer extension is installed. Mirrors the official
 * SDK: trust the injected flag when present, otherwise probe the extension
 * and treat a non-response (2s) as "not installed".
 */
export async function isLobstrInstalled(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (window.lobstrSignerExtension) return true;
  try {
    const res = await postLobstrRequest(
      { type: "REQUEST_CONNECTION_STATUS", version: API_VERSION_V2 },
      CONNECTION_STATUS_TIMEOUT_MS
    );
    return res.isConnected === true;
  } catch {
    return false;
  }
}

/**
 * Prompts for access and resolves with the authorized public key, caching
 * the key and the returned connection token for later reads/signing.
 * @throws the user declined, or no LOBSTR wallet is linked to the extension
 */
export async function requestLobstrAccess(): Promise<string> {
  const res = await postLobstrRequest({
    type: "REQUEST_ACCESS",
    version: API_VERSION_V2,
  });

  if (res.error) {
    throw responseError(res, "Wallet access was denied");
  }

  const publicKey = res.publicKey ?? "";
  if (!publicKey) {
    throw new Error(
      "No LOBSTR wallet is linked to the signer extension yet. Open the LOBSTR app and connect it, then try again."
    );
  }

  if (res.connectionKey) writeSession(CONNECTION_KEY, res.connectionKey);
  writeSession(PUBLIC_KEY_CACHE_KEY, publicKey);
  return publicKey;
}

/**
 * Cached public key from the last successful `requestLobstrAccess`.
 *
 * Deliberately does not call the extension: `REQUEST_ACCESS` opens a popup
 * in the LOBSTR app, which a passive refresh must never do.
 */
export function getCachedLobstrPublicKey(): string | null {
  return readSession(PUBLIC_KEY_CACHE_KEY);
}

/** Signs a transaction envelope with the linked LOBSTR wallet. */
export async function signLobstrTransaction(xdr: string): Promise<string> {
  const connectionKey = readSession(CONNECTION_KEY);
  if (!connectionKey) {
    throw new Error(
      "Connect LOBSTR before signing a transaction."
    );
  }

  const res = await postLobstrRequest({
    type: "SIGN",
    version: API_VERSION_V2,
    dataToSign: xdr,
    connectionKey,
    signType: "transaction",
  });

  if (res.error) {
    throw responseError(res, "Signing was rejected.");
  }
  if (!res.signedData) {
    throw new Error("Signing was rejected.");
  }
  return res.signedData;
}

/** Forgets the local session (the connection token and cached key). */
export function clearLobstrSession(): void {
  removeSession(CONNECTION_KEY);
  removeSession(PUBLIC_KEY_CACHE_KEY);
}
