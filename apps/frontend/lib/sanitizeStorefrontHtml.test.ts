import { describe, expect, it } from "vitest";
import {
  DEFAULT_ALLOWED_STOREFRONT_TAGS,
  sanitizeStorefrontHtml,
} from "./sanitizeStorefrontHtml";

describe("sanitizeStorefrontHtml (Issue #1026)", () => {
  it("renders safe formatting tags without modification", () => {
    const input =
      "<p>Welcome to <b>Our Store</b>! <i>High quality</i> <em>goods</em> and <strong>reliable</strong> delivery.</p>";
    const output = sanitizeStorefrontHtml(input);
    expect(output).toBe(input);
  });

  it("preserves lists and line breaks", () => {
    const input = "<ul><li>Item 1</li><li>Item 2<br>Note</li></ul>";
    const output = sanitizeStorefrontHtml(input);
    expect(output).toBe(input);
  });

  it("strips script tags completely", () => {
    const input = "<p>Store info</p><script>alert('XSS')</script>";
    const output = sanitizeStorefrontHtml(input);
    expect(output).not.toContain("<script>");
    expect(output).not.toContain("alert");
    expect(output).toContain("<p>Store info</p>");
  });

  it("strips dangerous inline event handlers like onerror and onload", () => {
    const input =
      '<p>Check out our products <img src="invalid.jpg" onerror="alert(document.cookie)">.</p>';
    const output = sanitizeStorefrontHtml(input);
    expect(output).not.toContain("onerror");
    expect(output).not.toContain("alert");
    expect(output).not.toContain("<img");
  });

  it("strips event handlers on allowed tags", () => {
    const input = '<b onmouseover="alert(\'pwned\')">Hover me</b>';
    const output = sanitizeStorefrontHtml(input);
    expect(output).not.toContain("onmouseover");
    expect(output).toBe("<b>Hover me</b>");
  });

  it("strips iframe, object, embed, and svg elements", () => {
    const input =
      '<div><iframe src="https://evil.com"></iframe><svg><script>alert(1)</script></svg></div>';
    const output = sanitizeStorefrontHtml(input);
    expect(output).not.toContain("<iframe");
    expect(output).not.toContain("<svg");
    expect(output).not.toContain("<script");
  });

  it("strips forbidden attributes including style and href", () => {
    const input =
      '<p style="background: red; color: yellow;">Notice with <a href="javascript:alert(1)">link</a></p>';
    const output = sanitizeStorefrontHtml(input);
    expect(output).not.toContain("style=");
    expect(output).not.toContain("javascript:");
    expect(output).not.toContain("<a ");
  });

  it("handles null, undefined, and non-string inputs safely", () => {
    expect(sanitizeStorefrontHtml(null)).toBe("");
    expect(sanitizeStorefrontHtml(undefined)).toBe("");
    expect(sanitizeStorefrontHtml("" as unknown as string)).toBe("");
  });

  it("allows custom allowedTags override", () => {
    const input = "<p>Paragraph with <b>bold</b> and <i>italic</i></p>";
    const output = sanitizeStorefrontHtml(input, { allowedTags: ["b"] });
    expect(output).not.toContain("<p>");
    expect(output).not.toContain("<i>");
    expect(output).toContain("<b>bold</b>");
  });

  it("exposes default allowed tags constant", () => {
    expect(DEFAULT_ALLOWED_STOREFRONT_TAGS).toContain("b");
    expect(DEFAULT_ALLOWED_STOREFRONT_TAGS).toContain("i");
    expect(DEFAULT_ALLOWED_STOREFRONT_TAGS).toContain("em");
    expect(DEFAULT_ALLOWED_STOREFRONT_TAGS).toContain("strong");
    expect(DEFAULT_ALLOWED_STOREFRONT_TAGS).toContain("p");
    expect(DEFAULT_ALLOWED_STOREFRONT_TAGS).toContain("ul");
    expect(DEFAULT_ALLOWED_STOREFRONT_TAGS).toContain("li");
    expect(DEFAULT_ALLOWED_STOREFRONT_TAGS).toContain("br");
  });
});
