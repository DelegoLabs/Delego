/**
 * Tests for #758 — SVG sanitization of merchant logos.
 *
 * Standard XSS injection vectors against SVG: embedded <script> bodies,
 * event-handler attributes, <foreignObject> HTML islands, javascript: URLs,
 * CDATA-wrapped payloads, and case-mangled tags. Every sanitized output must
 * be inert while preserving benign vector content.
 */

import { describe, it, expect } from "vitest";
import { sanitizeSvgXml, isSanitizableSvg } from "./sanitizeSvg";

describe("sanitizeSvgXml (#758)", () => {
  it("preserves benign SVG content", () => {
    const benign =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M4 4h16v16H4z" fill="#4f46e5"/><circle cx="12" cy="12" r="4"/></svg>';

    const result = sanitizeSvgXml(benign);

    expect(result).toContain("<svg");
    expect(result).toContain('<path d="M4 4h16v16H4z"');
    expect(result).toContain("<circle");
  });

  it("strips embedded <script> tags and their bodies", () => {
    const malicious =
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert("xss")</script><rect width="10" height="10"/></svg>';

    const result = sanitizeSvgXml(malicious);

    expect(result.toLowerCase()).not.toContain("<script");
    expect(result).not.toContain("alert");
    expect(result).toContain("<rect");
  });

  it("strips event-handler attributes (onload, onerror, onclick)", () => {
    const malicious =
      '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><rect width="10" height="10" onmouseover="steal()" onerror="pwn()"/></svg>';

    const result = sanitizeSvgXml(malicious);

    expect(result).not.toContain("onload");
    expect(result).not.toContain("onmouseover");
    expect(result).not.toContain("onerror");
    expect(result).not.toContain("alert(1)");
    expect(result.toLowerCase()).toContain("<rect");
  });

  it("strips <foreignObject> HTML islands", () => {
    const malicious =
      '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><div xmlns="http://www.w3.org/1999/xhtml"><img src=x onerror="alert(1)"/></div></foreignObject><circle r="5"/></svg>';

    const result = sanitizeSvgXml(malicious);

    expect(result.toLowerCase()).not.toContain("foreignobject");
    expect(result).not.toContain("<img");
    expect(result).not.toContain("onerror");
  });

  it("neutralizes javascript: URLs in href attributes", () => {
    const malicious =
      '<svg xmlns="http://www.w3.org/2000/svg"><a href="javascript:alert(1)"><rect width="10" height="10"/></a></svg>';

    const result = sanitizeSvgXml(malicious);

    expect(result.toLowerCase()).not.toContain("javascript:");
  });

  it("neutralizes javascript: URLs in xlink:href", () => {
    const malicious =
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><use xlink:href="javascript:alert(1)"/></svg>';

    const result = sanitizeSvgXml(malicious);

    expect(result.toLowerCase()).not.toContain("javascript:");
  });

  it("removes case-mangled script tags (mixed case evasion)", () => {
    const malicious =
      '<svg xmlns="http://www.w3.org/2000/svg"><ScRiPt>alert(1)</sCrIpT><rect width="10" height="10"/></svg>';

    const result = sanitizeSvgXml(malicious);

    expect(result.toLowerCase()).not.toContain("script");
    expect(result).not.toContain("alert(1)");
  });

  it("removes CDATA-wrapped script payloads", () => {
    const malicious =
      '<svg xmlns="http://www.w3.org/2000/svg"><script><![CDATA[alert(1)]]></script><rect width="10" height="10"/></svg>';

    const result = sanitizeSvgXml(malicious);

    expect(result.toLowerCase()).not.toContain("<script");
    expect(result).not.toContain("alert(1)");
    expect(result).toContain("<rect");
  });

  it("handles unclosed script tags without crashing", () => {
    const malicious =
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)';

    const result = sanitizeSvgXml(malicious);

    expect(result.toLowerCase()).not.toContain("<script");
    expect(result).not.toContain("alert(1)");
  });

  it("returns empty string for empty and non-string input", () => {
    expect(sanitizeSvgXml("")).toBe("");
    expect(sanitizeSvgXml("   ")).toBe("");
    expect(sanitizeSvgXml(undefined as unknown as string)).toBe("");
  });

  it("is idempotent — sanitizing twice equals sanitizing once", () => {
    const malicious =
      '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(2)</script><rect width="10" height="10" onerror="pwn()"/></svg>';

    const once = sanitizeSvgXml(malicious);
    const twice = sanitizeSvgXml(once);

    expect(twice).toBe(once);
  });

  it("keeps gradients and filters (visual fidelity)", () => {
    const benign =
      '<svg xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g"><stop offset="0" stop-color="#fff"/></linearGradient></defs><rect width="10" height="10" fill="url(#g)"/></svg>';

    const result = sanitizeSvgXml(benign);

    expect(result).toContain("linearGradient");
    expect(result).toContain("url(#g)");
  });
});

describe("isSanitizableSvg (#758)", () => {
  it("accepts sanitized output that retains a root <svg>", () => {
    const sanitized = sanitizeSvgXml(
      '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>',
    );
    expect(isSanitizableSvg(sanitized)).toBe(true);
  });

  it("rejects output with no <svg> element left", () => {
    const destroyed = sanitizeSvgXml("<script>alert(1)</script>");
    expect(isSanitizableSvg(destroyed)).toBe(false);
  });
});
