/**
 * WebAuthn (fingerprint / Face ID) quick-approval for high-value orders (#724).
 *
 * The platform authenticator is treated as a *convenience*, never as the only
 * way in: after `MAX_BIOMETRIC_ATTEMPTS` failed assertions the caller must
 * fall back to the wallet PIN signature. That rule is enforced here, in the
 * lib, so every call site inherits it.
 *
 * A passkey cannot sign a Stellar transaction on its own — the assertion
 * proves presence, the wallet still produces the payment signature — so the
 * value returned by `requestBiometricAssertion` is an approval *proof*, not
 * a transaction signature.
 */

/** Failed assertions allowed before the UI must offer the wallet PIN. */
export const MAX_BIOMETRIC_ATTEMPTS = 3;

export class BiometricNotSupportedError extends Error {
  constructor() {
    super("This device does not support biometric verification.");
    this.name = "BiometricNotSupportedError";
  }
}

export class BiometricCancelledError extends Error {
  constructor() {
    super("Biometric verification was cancelled.");
    this.name = "BiometricCancelledError";
  }
}

/** True when the browser exposes a secure-context WebAuthn `credentials.get`. */
export function isBiometricSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    window.isSecureContext === true &&
    typeof window.PublicKeyCredential === "function" &&
    typeof navigator.credentials?.get === "function"
  );
}

/**
 * True when a built-in authenticator (Touch ID / Windows Hello / Android
 * biometrics) is available, so the UI can show the fingerprint/face
 * affordance instead of a USB-key prompt. Resolves false rather than
 * rejecting when the browser has no `isUserVerifyingPlatformAuthenticatorAvailable`.
 */
export async function hasPlatformAuthenticator(): Promise<boolean> {
  if (!isBiometricSupported()) return false;
  const api = (
    PublicKeyCredential as unknown as {
      isUserVerifyingPlatformAuthenticatorAvailable?: () => Promise<boolean>;
    }
  ).isUserVerifyingPlatformAuthenticatorAvailable;
  if (typeof api !== "function") return false;
  try {
    return await api.call(PublicKeyCredential);
  } catch {
    return false;
  }
}

function bytesToBase64Url(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (let i = 0; i < view.length; i += 1) {
    binary += String.fromCharCode(view[i]!);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, "="));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Copies `bytes` into a standalone `ArrayBuffer`. The WebAuthn types want an
 * ArrayBuffer-backed view, and a caller-supplied `Uint8Array` may be a window
 * onto a larger one — the copy guarantees the challenge is exactly the bytes
 * the caller asked for.
 */
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return new Uint8Array(bytes).buffer;
}

export interface BiometricAssertionRequest {
  orderId: string;
  /** Human-facing amount, e.g. "1,500.00 XLM". Echoed back in the challenge. */
  amount: string;
  /** Passkey credential ids from registration. Empty means a discoverable ("usernameless") credential. */
  credentialIds?: string[];
  /** Overridable for deterministic tests. Defaults to 32 random bytes. */
  challenge?: Uint8Array;
}

/**
 * Requests a user-verifying WebAuthn assertion for `orderId`.
 *
 * Resolves with the base64url-encoded assertion, which the gateway verifies
 * against the registered passkey. Rejects with `BiometricNotSupportedError`,
 * `BiometricCancelledError`, or the original `DOMException`.
 */
export async function requestBiometricAssertion(
  request: BiometricAssertionRequest
): Promise<string> {
  if (!isBiometricSupported()) throw new BiometricNotSupportedError();

  // Copy any caller-supplied challenge into a fresh, `ArrayBuffer`-backed view
  // so WebAuthn reads exactly those bytes; otherwise generate 32 random bytes.
  const challenge = request.challenge
    ? new Uint8Array(request.challenge)
    : crypto.getRandomValues(new Uint8Array(32));
  // `BufferSource` wants an `ArrayBuffer`-backed view; wrapping the decoded
  // bytes through `toArrayBuffer` keeps the id out of `SharedArrayBuffer`
  // territory, which the DOM types reject.
  const allowCredentials = (request.credentialIds ?? []).map((id) => ({
    id: toArrayBuffer(base64UrlToBytes(id)),
    type: "public-key" as PublicKeyCredentialType,
  }));

  let credential: Credential | null;
  try {
    credential = await navigator.credentials.get({
      publicKey: {
        challenge,
        rpId: window.location.hostname,
        timeout: 60_000,
        userVerification: "required" as UserVerificationRequirement,
        ...(allowCredentials.length > 0 ? { allowCredentials } : {}),
      },
    });
  } catch (error) {
    if (error instanceof DOMException) {
      if (error.name === "NotAllowedError") throw new BiometricCancelledError();
      if (error.name === "NotSupportedError" || error.name === "SecurityError") {
        throw new BiometricNotSupportedError();
      }
    }
    throw error;
  }

  if (!credential || credential.type !== "public-key") {
    throw new Error("Biometric verification did not return a credential.");
  }

  const assertion = credential as PublicKeyCredential;
  const response = assertion.response as AuthenticatorAssertionResponse;

  return JSON.stringify({
    orderId: request.orderId,
    amount: request.amount,
    credentialId: bytesToBase64Url(assertion.rawId),
    authenticatorData: bytesToBase64Url(response.authenticatorData),
    clientDataJSON: bytesToBase64Url(response.clientDataJSON),
    signature: bytesToBase64Url(response.signature),
    userHandle: response.userHandle
      ? bytesToBase64Url(response.userHandle)
      : null,
  });
}

/**
 * Whether the caller must stop offering biometrics and fall back to the
 * wallet PIN. True once `attempts` reaches the cap.
 */
export function shouldFallBackToPin(attempts: number): boolean {
  return attempts >= MAX_BIOMETRIC_ATTEMPTS;
}

/** Remaining attempts after `attempts` failures, floored at 0. */
export function remainingAttempts(attempts: number): number {
  return Math.max(0, MAX_BIOMETRIC_ATTEMPTS - attempts);
}

/** Copy shown in the fallback banner once the cap is reached. */
export function pinFallbackMessage(amount: string): string {
  return `Biometric verification failed ${MAX_BIOMETRIC_ATTEMPTS} times. Approve this ${amount} order with your wallet PIN instead.`;
}

/** Maps a thrown error to user-facing copy. */
export function biometricErrorMessage(error: unknown): string {
  if (error instanceof BiometricNotSupportedError) {
    return "This device does not support biometric verification. Approve with your wallet PIN instead.";
  }
  if (error instanceof BiometricCancelledError) {
    return "Biometric verification was cancelled. You can try again when you are ready.";
  }
  if (error instanceof DOMException && error.name === "InvalidStateError") {
    return "No passkey is registered for this account on this device. Approve with your wallet PIN instead.";
  }
  if (error instanceof Error && error.message) return error.message;
  return "Biometric verification failed. Try again or approve with your wallet PIN.";
}
