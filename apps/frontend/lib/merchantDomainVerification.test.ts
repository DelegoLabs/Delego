import { describe, it, expect, vi, beforeEach } from "vitest";
import { verifyDomainOwnership, parseTOML, isValidDomainFormat, generateVerificationMessage } from "./merchantDomainVerification";

// Mock fetch for tests
beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// parseTOML Tests
// ---------------------------------------------------------------------------

describe("parseTOML", () => {
  it("parses simple key-value pairs", () => {
    const toml = `
# This is a comment
SOMETHING = "value"
OTHER_KEY = "another value"
`;

    const result = parseTOML(toml);
    expect(result.SOMETHING).toBe("value");
    expect(result.OTHER_KEY).toBe("another value");
  });

  it("parses arrays in single line", () => {
    const toml = `SOME_KEYS = ["value1", "value2", "value3"]`;

    const result = parseTOML(toml);
    expect(result.SOME_KEYS).toEqual(["value1", "value2", "value3"]);
  });

  it("parses multi-line arrays", () => {
    const toml = `
SOME_KEYS = [
  "value1",
  "value2",
  "value3"
]`;

    const result = parseTOML(toml);
    expect(result.SOME_KEYS).toEqual(["value1", "value2", "value3"]);
  });

  it("handles comments correctly", () => {
    const toml = `
# Header comment
SOMETHING = "value" # Inline comment
# Another comment
OTHER = "data"
`;

    const result = parseTOML(toml);
    expect(result.SOMETHING).toBe("value");
    expect(result.OTHER).toBe("data");
    expect(Object.keys(result)).toHaveLength(2);
  });

  it("ignores empty lines and whitespace", () => {
    const toml = `
  
  KEY = "value"  
  

  ANOTHER = "data"
`;

    const result = parseTOML(toml);
    expect(result.KEY).toBe("value");
    expect(result.ANOTHER).toBe("data");
  });
});

// ---------------------------------------------------------------------------
// isValidDomainFormat Tests
// ---------------------------------------------------------------------------

describe("isValidDomainFormat", () => {
  it("accepts valid domain names", () => {
    expect(isValidDomainFormat("example.com")).toBe(true);
    expect(isValidDomainFormat("sub.example.com")).toBe(true);
    expect(isValidDomainFormat("my-store.io")).toBe(true);
    expect(isValidDomainFormat("shop123.test")).toBe(true);
  });

  it("rejects invalid domain formats", () => {
    expect(isValidDomainFormat("")).toBe(false);
    expect(isValidDomainFormat("example")).toBe(false);
    expect(isValidDomainFormat("example..com")).toBe(false);
    expect(isValidDomainFormat("-example.com")).toBe(false);
    expect(isValidDomainFormat("example-.com")).toBe(false);
    expect(isValidDomainFormat("example.c")).toBe(false);
  });

  it("handles domains with protocol prefixes", () => {
    expect(isValidDomainFormat("https://example.com")).toBe(true);
    expect(isValidDomainFormat("http://example.com")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// generateVerificationMessage Tests
// ---------------------------------------------------------------------------

describe("generateVerificationMessage", () => {
  it("generates correct message format", () => {
    const message = generateVerificationMessage("example.com", new Date("2026-01-15T10:00:00Z"));
    expect(message).toBe("Verify domain ownership for example.com on 2026-01-15T10:00:00.000Z");
  });

  it("uses current date when timestamp not provided", () => {
    const now = new Date();
    const message = generateVerificationMessage("example.com");
    expect(message).toContain("Verify domain ownership for example.com on");
    expect(message).toContain(now.getFullYear().toString());
  });
});

// ---------------------------------------------------------------------------
// verifyDomainOwnership Tests (with mocked fetch)
// ---------------------------------------------------------------------------

describe("verifyDomainOwnership", () => {
  const mockStellarAddress = "GCEYUZC5MZNB7JYA6ZZ2JNP2LAD23SDUWG52EZKDYAEEIJ2Y6XVWER74";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns error for empty domain", async () => {
    const result = await verifyDomainOwnership("", mockStellarAddress);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Domain name is required.");
  });

  it("returns error for invalid Stellar address", async () => {
    const result = await verifyDomainOwnership("example.com", "invalid");
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Invalid Stellar address format.");
  });

  it("returns error when stellar.toml not found", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: false,
      status: 404,
      statusText: "Not Found",
      text: () => Promise.resolve("Not Found"),
    } as Response);

    const result = await verifyDomainOwnership("example.com", mockStellarAddress);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("stellar.toml not found");
  });

  it("returns error when SIGNING_KEY missing", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(`
# Simple TOML without SIGNING_KEY
SOME_OTHER_KEY = "value"
`),
    } as Response);

    const result = await verifyDomainOwnership("example.com", mockStellarAddress);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("stellar.toml does not contain a SIGNING_KEY entry.");
  });

  it("returns error when SIGNING_KEY does not match", async () => {
    const differentAddress = "GDWGD3GWRECKKQ7IYSECJ2JKR4U3FQRRA66FMQFZWTPO2TEQTUNIWTYF";
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(`
# Merchant TOML
SIGNING_KEY = "${differentAddress}"
`),
    } as Response);

    const result = await verifyDomainOwnership("example.com", mockStellarAddress);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("does not match your Stellar address");
    expect(result.signingKey).toBe(differentAddress);
  });

  it("validates when SIGNING_KEY matches", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(`
# Merchant TOML with matching key
SIGNING_KEY = "${mockStellarAddress}"
`),
    } as Response);

    const result = await verifyDomainOwnership("example.com", mockStellarAddress);
    expect(result.valid).toBe(true);
    expect(result.signingKey).toBe(mockStellarAddress);
  });

  it("handles array of signing keys", async () => {
    const address1 = mockStellarAddress;
    const address2 = "GDWGD3GWRECKKQ7IYSECJ2JKR4U3FQRRA66FMQFZWTPO2TEQTUNIWTYF";

    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(`
# Multiple signing keys
SIGNING_KEY = [
  "${address1}",
  "${address2}"
]
`),
    } as Response);

    // Test with second address (first doesn't match)
    const result = await verifyDomainOwnership("example.com", address2);
    expect(result.valid).toBe(true);
    expect(result.signingKey).toBe(`${address1}, ${address2}`);
  });

  it("strips quotes from signing key values", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(`
# Key with quotes
SIGNING_KEY = "${mockStellarAddress}"
`),
    } as Response);

    const result = await verifyDomainOwnership("example.com", mockStellarAddress);
    expect(result.valid).toBe(true);
  });

  it("handles network errors gracefully", async () => {
    vi.spyOn(global, "fetch").mockRejectedValue(new Error("Network error"));

    const result = await verifyDomainOwnership("example.com", mockStellarAddress);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Failed to fetch stellar.toml");
  });

  it("handles malformed TOML gracefully", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(`
# Malformed TOML
INVALID SYNTAX HERE
  MISSING EQUALS SIGN
`),
    } as Response);

    const result = await verifyDomainOwnership("example.com", mockStellarAddress);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("stellar.toml does not contain a SIGNING_KEY entry.");
  });
});