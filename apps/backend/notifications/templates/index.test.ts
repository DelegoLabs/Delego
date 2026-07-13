import { describe, it, expect } from "vitest";
import {
  validatePaymentFailedData,
  validateEscrowReleasedData,
  renderTemplateContent,
  renderNamedTemplate,
  extractPlaceholders,
} from "./index.js";

describe("validatePaymentFailedData", () => {
  it("accepts all required fields", () => {
    const result = validatePaymentFailedData({
      orderId: "ord-1",
      reason: "Insufficient funds",
    });
    expect(result).toEqual({ orderId: "ord-1", reason: "Insufficient funds" });
  });

  it("accepts all fields including optional ones", () => {
    const result = validatePaymentFailedData({
      orderId: "ord-1",
      reason: "Card declined",
      userName: "Alice",
      supportUrl: "https://support.delego.app",
    });
    expect(result.userName).toBe("Alice");
    expect(result.supportUrl).toBe("https://support.delego.app");
  });

  it("renders cleanly when optional fields are absent", () => {
    const result = validatePaymentFailedData({ orderId: "ord-2", reason: "Expired card" });
    expect(result.userName).toBeUndefined();
    expect(result.supportUrl).toBeUndefined();
  });

  it("throws when orderId is missing", () => {
    expect(() => validatePaymentFailedData({ reason: "Failed" })).toThrow("orderId is required");
  });

  it("throws when reason is missing", () => {
    expect(() => validatePaymentFailedData({ orderId: "ord-1" })).toThrow("reason is required");
  });

  it("throws when data is not an object", () => {
    expect(() => validatePaymentFailedData(null)).toThrow("Template data must be an object");
  });
});

describe("validateEscrowReleasedData", () => {
  it("accepts all required fields", () => {
    const result = validateEscrowReleasedData({
      orderId: "ord-1",
      amount: "100 XLM",
      txHash: "abc123",
    });
    expect(result).toEqual({ orderId: "ord-1", amount: "100 XLM", txHash: "abc123" });
  });

  it("accepts optional merchantName", () => {
    const result = validateEscrowReleasedData({
      orderId: "ord-1",
      amount: "50 XLM",
      txHash: "def456",
      merchantName: "Acme Corp",
    });
    expect(result.merchantName).toBe("Acme Corp");
  });

  it("renders cleanly when merchantName is omitted", () => {
    const result = validateEscrowReleasedData({
      orderId: "ord-1",
      amount: "10 XLM",
      txHash: "ghi789",
    });
    expect(result.merchantName).toBeUndefined();
  });

  it("throws when orderId is missing", () => {
    expect(() =>
      validateEscrowReleasedData({ amount: "10 XLM", txHash: "abc" })
    ).toThrow("orderId is required");
  });

  it("throws when amount is missing", () => {
    expect(() =>
      validateEscrowReleasedData({ orderId: "ord-1", txHash: "abc" })
    ).toThrow("amount is required");
  });

  it("throws when txHash is missing", () => {
    expect(() =>
      validateEscrowReleasedData({ orderId: "ord-1", amount: "10 XLM" })
    ).toThrow("txHash is required");
  });

  it("throws when data is not an object", () => {
    expect(() => validateEscrowReleasedData("bad")).toThrow("Template data must be an object");
  });
});

// ── Issue #136: Template render error handling ─────────────────────────────

describe("renderTemplateContent", () => {
  const sample = "<p>Hello {{userName}}, order {{orderId}}</p>";

  it("returns html on valid render", () => {
    const result = renderTemplateContent(sample, {
      userName: "Ada",
      orderId: "ord-9",
    });
    expect(result.error).toBeUndefined();
    expect(result.html).toBe("<p>Hello Ada, order ord-9</p>");
  });

  it("returns error when required variables are missing", () => {
    const result = renderTemplateContent(sample, { userName: "Ada" });
    expect(result.html).toBeUndefined();
    expect(result.error).toBe("Missing required template variables: orderId");
  });

  it("extracts unique placeholders", () => {
    expect(extractPlaceholders("{{a}} {{b}} {{a}}")).toEqual(["a", "b"]);
  });
});

describe("renderNamedTemplate", () => {
  it("renders approval-request with all variables", () => {
    const result = renderNamedTemplate("approval-request", {
      orderId: "ord-1",
      amount: "10 XLM",
      approvalUrl: "https://example.com/approve",
    });
    expect(result.error).toBeUndefined();
    expect(result.html).toContain("ord-1");
    expect(result.html).toContain("10 XLM");
    expect(result.html).toContain("https://example.com/approve");
    expect(result.html).not.toMatch(/\{\{/);
  });

  it("returns error for missing-variable render", () => {
    const result = renderNamedTemplate("approval-request", {
      orderId: "ord-1",
      amount: "10 XLM",
    });
    expect(result.html).toBeUndefined();
    expect(result.error).toContain("Missing required template variables");
    expect(result.error).toContain("approvalUrl");
  });

  it("returns error when template file is missing", () => {
    const result = renderNamedTemplate("does-not-exist", { foo: "bar" });
    expect(result.html).toBeUndefined();
    expect(result.error).toBe("Template not found: does-not-exist");
  });
});
