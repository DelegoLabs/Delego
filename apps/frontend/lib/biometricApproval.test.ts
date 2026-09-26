import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BiometricCancelledError,
  BiometricNotSupportedError,
  MAX_BIOMETRIC_ATTEMPTS,
  biometricErrorMessage,
  hasPlatformAuthenticator,
  isBiometricSupported,
  pinFallbackMessage,
  remainingAttempts,
  requestBiometricAssertion,
  shouldFallBackToPin,
} from "./biometricApproval";

const ORIGINAL_WINDOW = window;

/** Installs a minimal, secure-context WebAuthn surface on `window`. */
function installWebAuthn(options: {
  available?: boolean;
  verifierAvailable?: boolean;
  get?: (request?: CredentialRequestOptions) => Promise<Credential | null>;
}) {
  const get =
    options.get ??
    vi.fn(async () => ({
      type: "public-key",
      rawId: new Uint8Array([1, 2, 3, 4]).buffer,
      response: {
        authenticatorData: new Uint8Array([9, 9]).buffer,
        clientDataJSON: new Uint8Array([7]).buffer,
        signature: new Uint8Array([5, 6, 7]).buffer,
        userHandle: null,
      },
    }) as unknown as Credential);

  class FakePublicKeyCredential {
    static isUserVerifyingPlatformAuthenticatorAvailable =
      options.verifierAvailable === false
        ? undefined
        : vi.fn(async () => options.available ?? true);
  }

  vi.stubGlobal("PublicKeyCredential", FakePublicKeyCredential);
  Object.defineProperty(window, "isSecureContext", {
    value: true,
    configurable: true,
  });
  Object.defineProperty(navigator, "credentials", {
    value: { get },
    configurable: true,
  });

  return { get };
}

function restoreSecureContext(value: boolean) {
  Object.defineProperty(window, "isSecureContext", {
    value,
    configurable: true,
  });
}

/** base64url → bytes, so assertions compare the real payload rather than a hand-computed string. */
function decodeBase64Url(value: string): number[] {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  return Array.from(
    atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, "=")),
    (char) => char.charCodeAt(0)
  );
}

beforeEach(() => {
  installWebAuthn({});
});

afterEach(() => {
  vi.unstubAllGlobals();
  restoreSecureContext(ORIGINAL_WINDOW.isSecureContext);
  vi.restoreAllMocks();
});

// ─── Availability ────────────────────────────────────────────────────────────

describe("isBiometricSupported", () => {
  it("is true in a secure context with PublicKeyCredential and credentials.get", () => {
    expect(isBiometricSupported()).toBe(true);
  });

  it("is false outside a secure context (plain http)", () => {
    restoreSecureContext(false);
    expect(isBiometricSupported()).toBe(false);
  });

  it("is false when the browser has no PublicKeyCredential", () => {
    vi.stubGlobal("PublicKeyCredential", undefined);
    expect(isBiometricSupported()).toBe(false);
  });

  it("is false when navigator.credentials.get is missing", () => {
    Object.defineProperty(navigator, "credentials", {
      value: {},
      configurable: true,
    });
    expect(isBiometricSupported()).toBe(false);
  });
});

describe("hasPlatformAuthenticator", () => {
  it("reports a built-in authenticator when one is available", async () => {
    await expect(hasPlatformAuthenticator()).resolves.toBe(true);
  });

  it("reports false when only removable keys are available", async () => {
    installWebAuthn({ available: false });
    await expect(hasPlatformAuthenticator()).resolves.toBe(false);
  });

  it("reports false when the browser does not implement the probe", async () => {
    installWebAuthn({ verifierAvailable: false });
    await expect(hasPlatformAuthenticator()).resolves.toBe(false);
  });

  it("reports false instead of rejecting when the probe throws", async () => {
    class Throwing {
      static async isUserVerifyingPlatformAuthenticatorAvailable() {
        throw new Error("not implemented");
      }
    }
    vi.stubGlobal("PublicKeyCredential", Throwing);
    await expect(hasPlatformAuthenticator()).resolves.toBe(false);
  });
});

// ─── Assertion request ───────────────────────────────────────────────────────

describe("requestBiometricAssertion", () => {
  it("asks for a user-verifying assertion and returns the signed payload", async () => {
    const { get } = installWebAuthn({});
    const signature = await requestBiometricAssertion({
      orderId: "order-1",
      amount: "1,500.00 XLM",
    });

    const parsed = JSON.parse(signature);
    expect(parsed.orderId).toBe("order-1");
    expect(parsed.amount).toBe("1,500.00 XLM");
    expect(decodeBase64Url(parsed.credentialId)).toEqual([1, 2, 3, 4]);
    expect(decodeBase64Url(parsed.signature)).toEqual([5, 6, 7]);
    expect(decodeBase64Url(parsed.authenticatorData)).toEqual([9, 9]);
    expect(parsed.userHandle).toBeNull();

    const request = (get as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(request.publicKey?.userVerification).toBe("required");
    // No credential ids supplied -> discoverable credential, no allowCredentials.
    expect(request.publicKey?.allowCredentials).toBeUndefined();
  });

  it("maps supplied credential ids into allowCredentials", async () => {
    const { get } = installWebAuthn({});
    await requestBiometricAssertion({
      orderId: "order-1",
      amount: "1 XLM",
      credentialIds: [btoa(String.fromCharCode(1, 2, 3, 4))],
    });

    const request = (get as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(request.publicKey?.allowCredentials).toHaveLength(1);
    expect(request.publicKey?.allowCredentials[0].type).toBe("public-key");
    expect(Array.from(new Uint8Array(request.publicKey.allowCredentials[0].id))).toEqual([
      1, 2, 3, 4,
    ]);
  });

  it("honours an explicit challenge so tests stay deterministic", async () => {
    const { get } = installWebAuthn({});
    await requestBiometricAssertion({
      orderId: "order-1",
      amount: "1 XLM",
      challenge: new Uint8Array(32),
    });

    const request = (get as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(request.publicKey?.challenge).toBeInstanceOf(Uint8Array);
  });

  it("throws BiometricNotSupportedError when WebAuthn is unavailable", async () => {
    restoreSecureContext(false);
    await expect(
      requestBiometricAssertion({ orderId: "order-1", amount: "1 XLM" })
    ).rejects.toBeInstanceOf(BiometricNotSupportedError);
  });

  it("maps a NotAllowedError (user dismissed) to BiometricCancelledError", async () => {
    installWebAuthn({
      get: async () => {
        throw new DOMException("cancelled", "NotAllowedError");
      },
    });
    await expect(
      requestBiometricAssertion({ orderId: "order-1", amount: "1 XLM" })
    ).rejects.toBeInstanceOf(BiometricCancelledError);
  });

  it("maps NotSupportedError / SecurityError to BiometricNotSupportedError", async () => {
    for (const name of ["NotSupportedError", "SecurityError"]) {
      installWebAuthn({
        get: async () => {
          throw new DOMException("nope", name);
        },
      });
      await expect(
        requestBiometricAssertion({ orderId: "order-1", amount: "1 XLM" })
      ).rejects.toBeInstanceOf(BiometricNotSupportedError);
    }
  });

  it("rethrows an unexpected DOMException untouched", async () => {
    installWebAuthn({
      get: async () => {
        throw new DOMException("aborted", "AbortError");
      },
    });
    await expect(
      requestBiometricAssertion({ orderId: "order-1", amount: "1 XLM" })
    ).rejects.toMatchObject({ name: "AbortError" });
  });

  it("throws when the authenticator returns no credential", async () => {
    installWebAuthn({ get: async () => null });
    await expect(
      requestBiometricAssertion({ orderId: "order-1", amount: "1 XLM" })
    ).rejects.toThrow(/did not return a credential/i);
  });

  it("throws when the authenticator returns a non-public-key credential", async () => {
    installWebAuthn({
      get: async () => ({ type: "password" }) as unknown as Credential,
    });
    await expect(
      requestBiometricAssertion({ orderId: "order-1", amount: "1 XLM" })
    ).rejects.toThrow(/did not return a credential/i);
  });
});

// ─── Fallback after 3 failures (#724 acceptance criterion) ───────────────────

describe("shouldFallBackToPin", () => {
  it("is false for the first two failures", () => {
    expect(shouldFallBackToPin(0)).toBe(false);
    expect(shouldFallBackToPin(1)).toBe(false);
    expect(shouldFallBackToPin(MAX_BIOMETRIC_ATTEMPTS - 1)).toBe(false);
  });

  it("is true on the third failure", () => {
    expect(MAX_BIOMETRIC_ATTEMPTS).toBe(3);
    expect(shouldFallBackToPin(MAX_BIOMETRIC_ATTEMPTS)).toBe(true);
  });

  it("stays true once the cap is passed", () => {
    expect(shouldFallBackToPin(MAX_BIOMETRIC_ATTEMPTS + 1)).toBe(true);
  });
});

describe("remainingAttempts", () => {
  it("counts down and never goes negative", () => {
    expect(remainingAttempts(0)).toBe(3);
    expect(remainingAttempts(2)).toBe(1);
    expect(remainingAttempts(3)).toBe(0);
    expect(remainingAttempts(9)).toBe(0);
  });
});

describe("pinFallbackMessage", () => {
  it("names the attempt count, the amount, and the wallet PIN", () => {
    const message = pinFallbackMessage("1,500.00 XLM");
    expect(message).toContain("3 times");
    expect(message).toContain("1,500.00 XLM");
    expect(message).toMatch(/wallet PIN/i);
  });
});

describe("biometricErrorMessage", () => {
  it("points unsupported devices at the wallet PIN", () => {
    expect(biometricErrorMessage(new BiometricNotSupportedError())).toMatch(
      /wallet PIN/i
    );
  });

  it("explains a cancellation without blaming the user", () => {
    expect(biometricErrorMessage(new BiometricCancelledError())).toMatch(
      /cancelled/i
    );
  });

  it("points a missing passkey at the wallet PIN", () => {
    const message = biometricErrorMessage(
      new DOMException("no credential", "InvalidStateError")
    );
    expect(message).toMatch(/wallet PIN/i);
  });

  it("surfaces a plain Error message as-is", () => {
    expect(biometricErrorMessage(new Error("Hardware busy"))).toBe(
      "Hardware busy"
    );
  });

  it("falls back to generic copy for an unknown throwable", () => {
    expect(biometricErrorMessage("boom")).toMatch(/wallet PIN/i);
    expect(biometricErrorMessage(undefined)).toMatch(/wallet PIN/i);
  });
});
