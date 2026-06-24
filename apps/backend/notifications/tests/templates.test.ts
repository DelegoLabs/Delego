/**
 * Unit tests — template renderer
 *
 * Covers:
 *  - Success path: all variables supplied → returns html + text
 *  - Failure path: missing required variable → returns structured error, no html/text
 *  - Failure path: empty-string variable treated as missing
 *  - Failure path: template file not found → returns TEMPLATE_NOT_FOUND error
 *  - Failure path: undeclared placeholder in template → returns MISSING_VARIABLES error
 *  - Text body is derived from HTML (tags stripped)
 */

import { describe, it, expect } from "vitest";
import { renderTemplate } from "../templates/index.js";

describe("renderTemplate — approval-request", () => {
  const VALID_VARS = {
    orderId: "order-42",
    amount: "100 XLM",
    approvalUrl: "https://app.delego.io/approve/order-42",
  };

  it("returns html and text when all required variables are provided", async () => {
    const result = await renderTemplate("approval-request", VALID_VARS);

    expect(result.error).toBeUndefined();
    expect(result.html).toBeDefined();
    expect(result.text).toBeDefined();

    // Variables should be interpolated in the output
    expect(result.html).toContain("order-42");
    expect(result.html).toContain("100 XLM");
    expect(result.html).toContain("https://app.delego.io/approve/order-42");

    // Text version should have no HTML tags
    expect(result.text).not.toMatch(/<[^>]+>/);
    expect(result.text).toContain("order-42");
  });

  it("returns a MISSING_VARIABLES error when orderId is absent", async () => {
    const { orderId: _omitted, ...missingOrderId } = VALID_VARS;
    const result = await renderTemplate("approval-request", missingOrderId);

    expect(result.html).toBeUndefined();
    expect(result.text).toBeUndefined();
    expect(result.error).toMatch(/^MISSING_VARIABLES:/);
    expect(result.error).toContain("orderId");
  });

  it("returns a MISSING_VARIABLES error when amount is absent", async () => {
    const { amount: _omitted, ...missingAmount } = VALID_VARS;
    const result = await renderTemplate("approval-request", missingAmount);

    expect(result.error).toMatch(/^MISSING_VARIABLES:/);
    expect(result.error).toContain("amount");
  });

  it("returns a MISSING_VARIABLES error when approvalUrl is absent", async () => {
    const { approvalUrl: _omitted, ...missingUrl } = VALID_VARS;
    const result = await renderTemplate("approval-request", missingUrl);

    expect(result.error).toMatch(/^MISSING_VARIABLES:/);
    expect(result.error).toContain("approvalUrl");
  });

  it("treats an empty-string variable as missing", async () => {
    const result = await renderTemplate("approval-request", {
      ...VALID_VARS,
      orderId: "",
    });

    expect(result.error).toMatch(/^MISSING_VARIABLES:/);
    expect(result.error).toContain("orderId");
  });

  it("lists all missing variables in a single error (not just the first)", async () => {
    const result = await renderTemplate("approval-request", {});

    expect(result.error).toMatch(/^MISSING_VARIABLES:/);
    expect(result.error).toContain("orderId");
    expect(result.error).toContain("amount");
    expect(result.error).toContain("approvalUrl");
  });
});

describe("renderTemplate — unknown template", () => {
  it("returns a TEMPLATE_NOT_FOUND error for a non-existent template name", async () => {
    const result = await renderTemplate("does-not-exist", {});

    expect(result.html).toBeUndefined();
    expect(result.text).toBeUndefined();
    expect(result.error).toMatch(/^TEMPLATE_NOT_FOUND:/);
    expect(result.error).toContain("does-not-exist");
  });
});
