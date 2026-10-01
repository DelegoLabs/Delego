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

export interface WebAuthnClientOptions {
  rpId: string;
  challenge: string;
  timeout: number;
  userVerification: "preferred" | "required";
}

export function buildWebAuthnOptions(
  overrideRpId?: string,
  userVerification: "preferred" | "required" = "required",
  timeout: number = 60_000
): WebAuthnClientOptions {
  const currentHostname =
    typeof window !== "undefined" && window.location ? window.location.hostname : "";
  const rpId = overrideRpId ?? currentHostname;

  const challengeBytes = crypto.getRandomValues(new Uint8Array(32));
  const challenge = bytesToBase64Url(challengeBytes);

  return {
    rpId,
    challenge,
    timeout,
    userVerification,
  };
}

export function verifyWebAuthnOrigin(clientRpId: string, expectedOrigin: string): boolean {
  if (!clientRpId || !expectedOrigin) return false;
  let parsedHost = expectedOrigin;
  try {
    if (expectedOrigin.includes("://")) {
      parsedHost = new URL(expectedOrigin).hostname;
    }
  } catch {
    parsedHost = expectedOrigin;
  }
  return clientRpId === parsedHost;
}

export async function createPasskeyCredential(
  stellarAddress: string,
  name: string,
  customOptions?: Partial<WebAuthnClientOptions>
): Promise<PasskeyCredential> {
  const options = buildWebAuthnOptions(
    customOptions?.rpId,
    customOptions?.userVerification,
    customOptions?.timeout
  );

  const currentHostname =
    typeof window !== "undefined" && window.location ? window.location.hostname : "";
  if (!verifyWebAuthnOrigin(options.rpId, currentHostname)) {
    throw new Error("Mismatched RP ID origin: passkey request origin does not match current host.");
  }

  const challenge = customOptions?.challenge
    ? new TextEncoder().encode(customOptions.challenge)
    : crypto.getRandomValues(new Uint8Array(32));

  const credential = await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: { name: "Delego", id: options.rpId },
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
        userVerification: options.userVerification,
      },
      timeout: options.timeout,
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
