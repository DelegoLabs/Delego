import { useCallback, useRef, useState } from "react";

export type KycDocumentType = "passport" | "id_card" | "business_license";

export interface KycUploadData {
  documentType: KycDocumentType;
  encryptedFileBlob: Blob;
  merchantId: string;
}

export interface KycUploadResult {
  documentId: string;
  status: KycUploadStatus;
  uploadedAt: string;
}

export type KycUploadStatus = "pending" | "verified" | "rejected";

export type KycUploadPhase = "idle" | "encrypting" | "uploading" | "success" | "error";

export interface UseKycUploadOptions {
  /** Base URL of the gateway API. Defaults to a same-origin path. */
  apiBaseUrl?: string;
  /** Called once the encrypted document is accepted by the gateway. */
  onUploaded?: (result: KycUploadResult) => void;
}

export interface UseKycUploadReturn {
  phase: KycUploadPhase;
  progress: number;
  error: string | null;
  result: KycUploadResult | null;
  upload: (input: { documentType: KycDocumentType; file: File; merchantId: string }) => Promise<KycUploadResult | null>;
  reset: () => void;
}

/**
 * Encrypts a document blob with AES-GCM using a fresh 256-bit key and
 * returns the ciphertext together with the key material the gateway needs
 * to decrypt it server-side. The key is wrapped with the gateway's
 * public key via RSA-OAEP-256 before leaving the browser.
 */
export async function encryptDocument(
  file: Blob,
  publicKeySpci: ArrayBuffer,
): Promise<{ blob: Blob; keyId: string; ivBase64: string }> {
  if (typeof window === "undefined" || !window.crypto?.subtle) {
    throw new Error("WebCrypto is unavailable in this environment.");
  }

  const crypto = window.crypto;
  const aesKey = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = await file.arrayBuffer();
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    aesKey,
    plaintext,
  );

  const rsaKey = await crypto.subtle.importKey(
    "spki",
    publicKeySpci,
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["encrypt"],
  );
  const rawKey = await crypto.subtle.exportKey("raw", aesKey);
  const wrappedKey = await crypto.subtle.encrypt({ name: "RSA-OAEP" }, rsaKey, rawKey);

  const payload = {
    wrappedKey: toBase64(new Uint8Array(wrappedKey)),
    iv: toBase64(iv),
    algorithm: "AES-256-GCM+RSA-OAEP-256",
  };

  const blob = new Blob([JSON.stringify(payload), "\n", ciphertext], {
    type: "application/octet-stream",
  });

  return { blob, keyId: payload.wrappedKey, ivBase64: payload.iv };
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

async function fetchGatewayPublicKey(apiBaseUrl: string): Promise<ArrayBuffer> {
  const response = await fetch(`${apiBaseUrl}/kyc/encryption-key`, {
    method: "GET",
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error("Unable to fetch the gateway encryption key.");
  }
  const json = (await response.json()) as { publicKey: string };
  if (!json.publicKey) {
    throw new Error("Gateway returned an invalid encryption key.");
  }
  return base64ToBuffer(json.publicKey);
}

function base64ToBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

export function useKycUpload(options: UseKycUploadOptions = {}): UseKycUploadReturn {
  const { apiBaseUrl = "/api", onUploaded } = options;
  const [currentApiBaseUrl] = useState(apiBaseUrl);
  const [phase, setPhase] = useState<KycUploadPhase>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<KycUploadResult | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setPhase("idle");
    setProgress(0);
    setError(null);
    setResult(null);
  }, []);

  const upload = useCallback(
    async (input: { documentType: KycDocumentType; file: File; merchantId: string }) => {
      setError(null);
      setResult(null);
      setProgress(0);
      setPhase("encrypting");

      try {
        const publicKey = await fetchGatewayPublicKey(currentApiBaseUrl);
        const { blob, keyId, ivBase64 } = await encryptDocument(input.file, publicKey);

        const form = new FormData();
        form.append("merchantId", input.merchantId);
        form.append("documentType", input.documentType);
        form.append("keyId", keyId);
        form.append("iv", ivBase64);
        form.append("file", blob, `${input.documentType}.enc`);

        setPhase("uploading");
        const controller = new AbortController();
        abortRef.current = controller;

        const uploaded = await uploadWithProgress(
          `${currentApiBaseUrl}/kyc/documents`,
          form,
          controller.signal,
          (percent) => setProgress(percent),
        );

        setProgress(100);
        setResult(uploaded);
        setPhase("success");
        onUploaded?.(uploaded);
        return uploaded;
      } catch (err) {
        if ((err as DOMException).name === "AbortError") {
          setPhase("idle");
          return null;
        }
        const message = err instanceof Error ? err.message : "KYC document upload failed.";
        setError(message);
        setPhase("error");
        return null;
      } finally {
        abortRef.current = null;
      }
    },
    [currentApiBaseUrl, onUploaded],
  );

  return { phase, progress, error, result, upload, reset };
}

function uploadWithProgress(
  url: string,
  body: FormData,
  signal: AbortSignal,
  onProgress: (percent: number) => void,
): Promise<KycUploadResult> {
  return new Promise<KycUploadResult>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.withCredentials = true;
    xhr.responseType = "json";

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(xhr.response as KycUploadResult);
      } else {
        const message =
          (xhr.response as { error?: string } | null)?.error ??
          `KYC upload failed with status ${xhr.status}.`;
        reject(new Error(message));
      }
    };

    xhr.onerror = () => reject(new Error("Network error while uploading KYC document."));
    xhr.onabort = () => reject(new DOMException("Upload aborted.", "AbortError"));

    signal.addEventListener("abort", () => xhr.abort());
    xhr.send(body);
  });
}
