import { describe, it, expect } from "vitest";
import {
  autoReleaseSummary,
  formatDeliveredTimestamp,
  isValidProofHash,
  isVerifiedAutoRelease,
  oracleProviderLabel,
  shortenProofHash,
  type AutoReleaseMeta,
} from "./autoRelease";

const HASH = "a".repeat(64);

function makeMeta(overrides: Partial<AutoReleaseMeta> = {}): AutoReleaseMeta {
  return {
    isAutoReleased: true,
    oracleProvider: "fedex",
    deliveredTimestamp: "2026-09-20T14:05:00.000Z",
    signatureProofHash: HASH,
    ...overrides,
  };
}

describe("isValidProofHash", () => {
  it("accepts a 64-character hex digest", () => {
    expect(isValidProofHash(HASH)).toBe(true);
    expect(isValidProofHash("A1B2".repeat(16))).toBe(true);
  });

  it("rejects short, non-hex, and missing hashes", () => {
    expect(isValidProofHash("abc")).toBe(false);
    expect(isValidProofHash("z".repeat(64))).toBe(false);
    expect(isValidProofHash("")).toBe(false);
    expect(isValidProofHash(null)).toBe(false);
    expect(isValidProofHash(undefined)).toBe(false);
  });
});

describe("isVerifiedAutoRelease", () => {
  it("is true only when both the flag and a usable proof hash are present", () => {
    expect(isVerifiedAutoRelease(makeMeta())).toBe(true);
  });

  it("rejects a manual release", () => {
    expect(isVerifiedAutoRelease(makeMeta({ isAutoReleased: false }))).toBe(false);
  });

  it("rejects an auto-release with no usable proof — there'd be nothing to show", () => {
    expect(isVerifiedAutoRelease(makeMeta({ signatureProofHash: "nope" }))).toBe(false);
  });

  it("handles null/undefined metadata", () => {
    expect(isVerifiedAutoRelease(null)).toBe(false);
    expect(isVerifiedAutoRelease(undefined)).toBe(false);
  });
});

describe("oracleProviderLabel", () => {
  it("maps the known providers to display names", () => {
    expect(oracleProviderLabel("easypost")).toBe("EasyPost");
    expect(oracleProviderLabel("fedex")).toBe("FedEx");
    expect(oracleProviderLabel("ups")).toBe("UPS");
  });

  it("falls back to the raw value for an unknown provider", () => {
    expect(oracleProviderLabel("dhl")).toBe("dhl");
  });
});

describe("shortenProofHash", () => {
  it("elides the middle of a long hash", () => {
    expect(shortenProofHash(HASH)).toBe(`${"a".repeat(10)}…${"a".repeat(8)}`);
    expect(shortenProofHash(HASH)).toContain("…");
  });

  it("returns short input unchanged", () => {
    expect(shortenProofHash("abc123")).toBe("abc123");
  });
});

describe("autoReleaseSummary", () => {
  it("words the release as automatic, contrasting with a manual release", () => {
    expect(autoReleaseSummary(makeMeta({ oracleProvider: "easypost" }))).toBe(
      "Auto-released via EasyPost tracking"
    );
  });
});

describe("formatDeliveredTimestamp", () => {
  it("formats a valid ISO timestamp", () => {
    const formatted = formatDeliveredTimestamp("2026-09-20T14:05:00.000Z", "en-US");
    expect(formatted).toContain("2026");
    expect(formatted).toContain("Sep");
  });

  it("returns an empty string for an invalid date", () => {
    expect(formatDeliveredTimestamp("not-a-date")).toBe("");
  });
});
