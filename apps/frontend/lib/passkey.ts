/**
 * WebAuthn passkey registration against the connected Stellar account (#696).
 */

import { apiFetch } from "./apiFetch";

export interface PasskeyCredential {
  credentialId: string;
  publicKey: string;
  name: string;
  createdAt: string;
}

export function isWebAuthnSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    window.isSecureContext === true &&
    typeof window.PublicKeyCredential === "function" &&
    typeof navigator.credentials?.create === "function"
  );
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export async function createPasskeyCredential(
  stellarAddress: string,
  name: string
): Promise<PasskeyCredential> {
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const credential = await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: { name: "Delego" },
      user: {
        id: new TextEncoder().encode(stellarAddress).slice(0, 64),
        name: stellarAddress,
        displayName: name.trim() || stellarAddress,
      },
      pubKeyCredParams: [
        { type: "public-key", alg: -7 },
        { type: "public-key", alg: -257 },
      ],
      authenticatorSelection: {
        authenticatorAttachment: "platform",
        residentKey: "preferred",
        userVerification: "required",
      },
      timeout: 60_000,
      attestation: "none",
    },
  });

  if (!credential || credential.type !== "public-key") {
    throw new Error("Passkey registration did not return a credential.");
  }

  const publicKeyCredential = credential as PublicKeyCredential;
  const attestation =
    publicKeyCredential.response as AuthenticatorAttestationResponse;
  const publicKey = attestation.getPublicKey();
  if (!publicKey) {
    throw new Error(
      "The authenticator did not return a public key. Try again, or keep signing with Freighter."
    );
  }

  return {
    credentialId: bytesToBase64Url(new Uint8Array(publicKeyCredential.rawId)),
    publicKey: bytesToBase64Url(new Uint8Array(publicKey)),
    name: name.trim() || "Delego passkey",
    createdAt: new Date().toISOString(),
  };
}

/** Posts the new credential so the gateway can bind it to the Stellar account. */
export async function registerPasskey(
  credential: PasskeyCredential,
  stellarAddress: string
): Promise<void> {
  const res = await apiFetch<{ credentialId: string }>("/passkeys", {
    method: "POST",
    body: JSON.stringify({ ...credential, stellarAddress }),
  });
  if (res.error) {
    throw new Error(res.error.message || "Could not register this passkey.");
  }
}

export function passkeyErrorMessage(err: unknown): string {
  if (err instanceof DOMException) {
    if (err.name === "NotAllowedError") {
      return "Passkey registration was cancelled. You can try again when you are ready.";
    }
    if (err.name === "NotSupportedError" || err.name === "SecurityError") {
      return "This device does not support passkeys. You can keep signing with the Freighter browser extension.";
    }
    if (err.name === "InvalidStateError") {
      return "A passkey for this account is already registered on this device.";
    }
  }
  if (err instanceof Error && err.message) return err.message;
  return "Could not register this passkey. Try again.";
}
