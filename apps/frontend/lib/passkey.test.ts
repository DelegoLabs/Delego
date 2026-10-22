import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  buildWebAuthnOptions,
  verifyWebAuthnOrigin,
  createPasskeyCredential,
  isWebAuthnSupported,
  credentialToRegistrationResult,
  type WebAuthnClientOptions,
  type PasskeyCredential,
} from "./passkey";

describe("WebAuthn rpId and origin verification", () => {
  const originalLocation = window.location;

  beforeEach(() => {
    Object.defineProperty(window, "location", {
      configurable: true,
      writable: true,
      value: { hostname: "app.delego.network", origin: "https://app.delego.network" },
    });
  });

  afterEach(() => {
    Object.defineProperty(window, "location", {
      configurable: true,
      writable: true,
      value: originalLocation,
    });
    vi.restoreAllMocks();
  });

  it("buildWebAuthnOptions explicitly configures rpId matching current window location hostname", () => {
    const options: WebAuthnClientOptions = buildWebAuthnOptions();
    expect(options.rpId).toBe("app.delego.network");
    expect(options.userVerification).toBe("required");
    expect(options.timeout).toBe(60000);
    expect(typeof options.challenge).toBe("string");
  });

  it("verifyWebAuthnOrigin accepts matching client rpId and origin", () => {
    expect(verifyWebAuthnOrigin("app.delego.network", "https://app.delego.network")).toBe(true);
    expect(verifyWebAuthnOrigin("app.delego.network", "app.delego.network")).toBe(true);
  });

  it("verifyWebAuthnOrigin rejects mismatched RP ID origins (cross-origin replay attempts)", () => {
    expect(verifyWebAuthnOrigin("malicious-mirror.com", "https://app.delego.network")).toBe(false);
    expect(verifyWebAuthnOrigin("phishing.org", "app.delego.network")).toBe(false);
    expect(verifyWebAuthnOrigin("", "https://app.delego.network")).toBe(false);
  });

  it("createPasskeyCredential rejects mismatched RP ID origins", async () => {
    await expect(
      createPasskeyCredential("GABC123", "Test Passkey", { rpId: "phishing.com" })
    ).rejects.toThrow("Mismatched RP ID origin");
  });
});

describe("Browser compatibility detection (isWebAuthnSupported)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns true when WebAuthn is fully supported in a secure context", () => {
    // Mock a fully supportive environment
    Object.defineProperty(global, "window", {
      configurable: true,
      writable: true,
      value: {
        isSecureContext: true,
        PublicKeyCredential: function() {},
        location: { hostname: "app.delego.network" },
      },
    });
    Object.defineProperty(global, "navigator", {
      configurable: true,
      writable: true,
      value: {
        credentials: { create: vi.fn() },
      },
    });

    expect(isWebAuthnSupported()).toBe(true);
  });

  it("returns false when window is undefined (SSR context)", () => {
    Object.defineProperty(global, "window", {
      configurable: true,
      writable: true,
      value: undefined,
    });

    expect(isWebAuthnSupported()).toBe(false);
  });

  it("returns false when not in a secure context (HTTP)", () => {
    Object.defineProperty(global, "window", {
      configurable: true,
      writable: true,
      value: {
        isSecureContext: false,
        PublicKeyCredential: function() {},
        location: { hostname: "localhost" },
      },
    });
    Object.defineProperty(global, "navigator", {
      configurable: true,
      writable: true,
      value: {
        credentials: { create: vi.fn() },
      },
    });

    expect(isWebAuthnSupported()).toBe(false);
  });

  it("returns false when PublicKeyCredential is not available", () => {
    Object.defineProperty(global, "window", {
      configurable: true,
      writable: true,
      value: {
        isSecureContext: true,
        location: { hostname: "app.delego.network" },
      },
    });
    Object.defineProperty(global, "navigator", {
      configurable: true,
      writable: true,
      value: {
        credentials: { create: vi.fn() },
      },
    });

    expect(isWebAuthnSupported()).toBe(false);
  });

  it("returns false when navigator.credentials.create is not available", () => {
    Object.defineProperty(global, "window", {
      configurable: true,
      writable: true,
      value: {
        isSecureContext: true,
        PublicKeyCredential: function() {},
        location: { hostname: "app.delego.network" },
      },
    });
    Object.defineProperty(global, "navigator", {
      configurable: true,
      writable: true,
      value: {
        credentials: {},
      },
    });

    expect(isWebAuthnSupported()).toBe(false);
  });

  it("returns false when navigator.credentials is undefined", () => {
    Object.defineProperty(global, "window", {
      configurable: true,
      writable: true,
      value: {
        isSecureContext: true,
        PublicKeyCredential: function() {},
        location: { hostname: "app.delego.network" },
      },
    });
    Object.defineProperty(global, "navigator", {
      configurable: true,
      writable: true,
      value: {},
    });

    expect(isWebAuthnSupported()).toBe(false);
  });
});

describe("credentialToRegistrationResult conversion", () => {
  it("converts legacy PasskeyCredential to PasskeyRegistrationResult with default ES256 algorithm", () => {
    const legacyCredential: PasskeyCredential = {
      credentialId: "abc123",
      publicKey: "spki-key-data",
      name: "Test Passkey",
      createdAt: "2024-01-01T00:00:00.000Z",
    };

    const result = credentialToRegistrationResult(legacyCredential);

    expect(result).toEqual({
      credentialId: "abc123",
      publicKeySpki: "spki-key-data",
      algorithm: -7, // ES256 default
      createdAt: "2024-01-01T00:00:00.000Z",
    });
  });

  it("converts legacy PasskeyCredential to PasskeyRegistrationResult with specified RS256 algorithm", () => {
    const legacyCredential: PasskeyCredential = {
      credentialId: "abc123",
      publicKey: "spki-key-data",
      name: "Test Passkey",
      createdAt: "2024-01-01T00:00:00.000Z",
    };

    const result = credentialToRegistrationResult(legacyCredential, -257);

    expect(result.algorithm).toBe(-257); // RS256
  });

  it("preserves all credential fields during conversion", () => {
    const legacyCredential: PasskeyCredential = {
      credentialId: "cred-456",
      publicKey: "spki-key-789",
      name: "My Device",
      createdAt: "2024-06-15T12:30:00.000Z",
    };

    const result = credentialToRegistrationResult(legacyCredential);

    expect(result.credentialId).toBe("cred-456");
    expect(result.publicKeySpki).toBe("spki-key-789");
    expect("name" in result).toBe(false); // name is not in PasskeyRegistrationResult
    expect(result.createdAt).toBe("2024-06-15T12:30:00.000Z");
  });
});
