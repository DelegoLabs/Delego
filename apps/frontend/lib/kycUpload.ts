import { env } from "./env";

/**
 * KYC document upload client (browser side).
 *
 * Documents are encrypted in the browser with a fresh AES-256-GCM key; the
 * key itself is wrapped with the gateway's RSA-OAEP-256 public key before it
 * leaves the page, so the gateway never sees the raw document in transit and
 * never holds a key we can read back.
 *
 * `components/merchant/*` re-exports these helpers so the merchant feature
 * can keep its public barrel; keep the implementation here.
 */

export type KycDocumentType = "passport" | "id_card" | "business_license";

export type KycVerificationStatus = "pending" | "verified" | "rejected";

export interface KycUploadData {
  documentType: KycDocumentType;
  /** Already-encrypted document produced by {@link encryptKycDocument}. */
  encryptedFileBlob: Blob;
  merchantId: string;
}

export interface KycUploadResult {
  uploadId: string;
  status: KycVerificationStatus;
}

export interface KycUploadOptions {
  /** Progress callback, 0-100. */
  onProgress?: (percent: number) => void;
  /** Address of the wallet that signed the merchant proof. */
  signerAddress?: string;
}

export interface KycPollOptions {
  signerAddress?: string;
  signal?: AbortSignal;
  onStatus?: (status: KycVerificationStatus) => void;
  /** Delay between polls in ms. Defaults to 5000. */
  intervalMs?: number;
}

/** How long a single verification poll is retried before giving up. */
const MAX_POLL_ATTEMPTS = 120;

const BASE_URL = env.NEXT_PUBLIC_API_URL;

function requireCrypto(): Crypto {
  const crypto = typeof globalThis !== "undefined" ? globalThis.crypto : undefined;
  if (!crypto?.subtle) {
    throw new Error("WebCrypto is unavailable in this environment.");
  }
  return crypto;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function fromBase64(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function readError(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string };
    return body.error ?? fallback;
  } catch {
    return fallback;
  }
}

/**
 * Encrypts a document with AES-256-GCM and returns the ciphertext along with
 * the key material the gateway needs to decrypt it. The key is exported,
 * wrapped with the gateway's RSA public key, and never persisted locally.
 */
export async function encryptKycDocument(
  file: Blob,
): Promise<{ blob: Blob; keyId: string; ivBase64: string }> {
  const crypto = requireCrypto();

  const response = await fetch(`${BASE_URL}/kyc/encryption-key`, {
    method: "GET",
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error(
      await readError(response, "Unable to fetch the gateway encryption key."),
    );
  }
  const { publicKey } = (await response.json()) as { publicKey: string };
  if (!publicKey) {
    throw new Error("Gateway returned an invalid encryption key.");
  }

  const rsaKey = await crypto.subtle.importKey(
    "spki",
    fromBase64(publicKey) as unknown as BufferSource,
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["encrypt"],
  );

  const aesKey = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt"],
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    aesKey,
    await file.arrayBuffer(),
  );

  const rawKey = await crypto.subtle.exportKey("raw", aesKey);
  const wrappedKey = await crypto.subtle.encrypt({ name: "RSA-OAEP" }, rsaKey, rawKey);

  const wrappedKeyBase64 = toBase64(new Uint8Array(wrappedKey));
  const ivBase64 = toBase64(iv);

  // The leading JSON line is the envelope the gateway reads before the
  // ciphertext bytes; keep them concatenated in one blob.
  const envelope = JSON.stringify({
    wrappedKey: wrappedKeyBase64,
    iv: ivBase64,
    algorithm: "AES-256-GCM+RSA-OAEP-256",
  });

  return {
    blob: new Blob([envelope, "\n", ciphertext], {
      type: "application/octet-stream",
    }),
    keyId: wrappedKeyBase64.slice(0, 16),
    ivBase64,
  };
}

/** Uploads an already-encrypted KYC document and returns its upload id. */
export async function uploadKycDocument(
  data: KycUploadData,
  options: KycUploadOptions = {},
): Promise<KycUploadResult> {
  const form = new FormData();
  form.append("merchantId", data.merchantId);
  form.append("documentType", data.documentType);
  if (options.signerAddress) {
    form.append("signerAddress", options.signerAddress);
  }
  form.append("file", data.encryptedFileBlob, `${data.documentType}.enc`);

  const body = await uploadWithProgress(
    `${BASE_URL}/kyc/documents`,
    form,
    options.onProgress,
  );

  return {
    uploadId: String(body.uploadId ?? body.documentId ?? ""),
    status: (body.status as KycVerificationStatus) ?? "pending",
  };
}

interface KycUploadResponseBody {
  uploadId?: string;
  documentId?: string;
  status?: KycVerificationStatus;
}

/** Polls verification status until the document leaves the `pending` state. */
export async function pollKycVerificationStatus(
  uploadId: string,
  options: KycPollOptions = {},
): Promise<KycVerificationStatus> {
  const { signerAddress, signal, onStatus, intervalMs = 5000 } = options;
  let status: KycVerificationStatus = "pending";

  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt += 1) {
    if (signal?.aborted) {
      throw new DOMException("Polling aborted.", "AbortError");
    }
    if (status !== "pending") {
      return status;
    }

    await delay(intervalMs, signal);
    if (signal?.aborted) {
      throw new DOMException("Polling aborted.", "AbortError");
    }

    const query = new URLSearchParams({ uploadId });
    if (signerAddress) {
      query.set("signerAddress", signerAddress);
    }
    const response = await fetch(
      `${BASE_URL}/kyc/documents/${encodeURIComponent(uploadId)}?${query.toString()}`,
      { method: "GET", credentials: "include", signal },
    );
    if (!response.ok) {
      throw new Error(
        await readError(response, "Unable to read KYC verification status."),
      );
    }
    const body = (await response.json()) as { status?: KycVerificationStatus };
    status = body.status ?? "pending";
    onStatus?.(status);
  }

  return status;
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    function onAbort() {
      clearTimeout(timer);
      reject(new DOMException("Polling aborted.", "AbortError"));
    }
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/** XHR rather than fetch so we can report upload progress. */
function uploadWithProgress(
  url: string,
  body: FormData,
  onProgress?: (percent: number) => void,
): Promise<KycUploadResponseBody> {
  return new Promise<KycUploadResponseBody>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.withCredentials = true;
    xhr.responseType = "json";

    if (onProgress) {
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          onProgress(Math.round((event.loaded / event.total) * 100));
        }
      };
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve((xhr.response ?? {}) as KycUploadResponseBody);
        return;
      }
      const message =
        (xhr.response as { error?: string } | null)?.error ??
        `KYC upload failed with status ${xhr.status}.`;
      reject(new Error(message));
    };
    xhr.onerror = () =>
      reject(new Error("Network error while uploading KYC document."));
    xhr.onabort = () =>
      reject(new DOMException("Upload aborted.", "AbortError"));

    xhr.send(body);
  });
}
