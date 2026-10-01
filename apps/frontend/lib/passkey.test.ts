import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  buildWebAuthnOptions,
  verifyWebAuthnOrigin,
  createPasskeyCredential,
  type WebAuthnClientOptions,
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
