export interface SessionKeyWorkerMessage {
  type: "SIGN_PAYLOAD" | "CLEAR_KEY" | "INIT_KEY";
  payload?: Uint8Array;
  keyId?: string;
}

export interface SessionKeyWorkerResponse {
  id: number;
  ok: boolean;
  signature?: Uint8Array;
  keyId?: string;
  error?: string;
}

let privateKey: CryptoKey | null = null;
let publicKey: CryptoKey | null = null;
let currentKeyId: string | null = null;

const EC_PARAMS: EcKeyGenParams = {
  name: "ECDSA",
  namedCurve: "P-256",
};

const SIGN_ALGORITHM: EcdsaParams = {
  name: "ECDSA",
  hash: "SHA-256",
};

function wipeKey(): void {
  privateKey = null;
  publicKey = null;
  currentKeyId = null;
}

async function initKey(keyId?: string): Promise<string> {
  wipeKey();
  const pair = await crypto.subtle.generateKey(EC_PARAMS, true, ["sign"]);
  privateKey = pair.privateKey;
  publicKey = pair.publicKey;
  currentKeyId = keyId ?? crypto.randomUUID();
  return currentKeyId;
}

async function signPayload(payload: Uint8Array): Promise<Uint8Array> {
  if (!privateKey) {
    throw new Error("Session key not initialized");
  }
  // `payload` arrives via structured clone, so its buffer is a real
  // ArrayBuffer; the cast satisfies lib.dom's stricter BufferSource.
  const signature = await crypto.subtle.sign(
    SIGN_ALGORITHM,
    privateKey,
    payload as unknown as BufferSource,
  );
  return new Uint8Array(signature);
}

self.addEventListener("message", (event: MessageEvent<SessionKeyWorkerMessage>) => {
  const { type, payload, keyId } = event.data;
  const id = (event.data as any).id ?? 0;

  const respond = (response: SessionKeyWorkerResponse) => {
    self.postMessage(response);
  };

  if (type === "CLEAR_KEY") {
    wipeKey();
    respond({ id, ok: true });
    return;
  }

  if (type === "INIT_KEY") {
    initKey(keyId)
      .then((newKeyId) => respond({ id, ok: true, keyId: newKeyId }))
      .catch((err: unknown) =>
        respond({
          id,
          ok: false,
          error: err instanceof Error ? err.message : "Key init failed",
        }),
      );
    return;
  }

  if (type === "SIGN_PAYLOAD") {
    if (!payload) {
      respond({ id, ok: false, error: "Missing payload" });
      return;
    }
    signPayload(payload)
      .then((signature) => respond({ id, ok: true, signature, keyId: currentKeyId ?? undefined }))
      .catch((err: unknown) =>
        respond({
          id,
          ok: false,
          error: err instanceof Error ? err.message : "Signing failed",
        }),
      );
    return;
  }

  respond({ id, ok: false, error: "Unknown message type" });
});

// Best-effort wipe when the worker is torn down (page close/navigation).
self.addEventListener("beforeunload", () => {
  wipeKey();
});
