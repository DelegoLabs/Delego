import { describe, it, expect } from "vitest";
import { sanitizeSvgXml } from "./svgSanitizer";

describe("svgSanitizer", () => {
  it("passes safe vector graphics unchanged or cleanly formatted", () => {
    const safeSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="red" /></svg>';
    const sanitized = sanitizeSvgXml(safeSvg);
    expect(sanitized).toContain("<svg");
    expect(sanitized).toContain("rect");
    expect(sanitized).not.toContain("script");
  });

  it("strips embedded <script> tags", () => {
    const malicious = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><rect width="10" height="10"/></svg>';
    const sanitized = sanitizeSvgXml(malicious);
    expect(sanitized).not.toContain("script");
    expect(sanitized).not.toContain("alert(1)");
    expect(sanitized).toContain("rect");
  });

  it("strips event attributes like onload or onclick", () => {
    const malicious = '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><circle cx="50" cy="50" r="40" onclick="alert(2)" /></svg>';
    const sanitized = sanitizeSvgXml(malicious);
    expect(sanitized).not.toContain("onload");
    expect(sanitized).not.toContain("onclick");
    expect(sanitized).not.toContain("alert");
    expect(sanitized).toContain("circle");
  });

  it("strips foreignObject elements", () => {
    const malicious = '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><body xmlns="http://www.w3.org/1999/xhtml"><script>alert(1)</script></body></foreignObject></svg>';
    const sanitized = sanitizeSvgXml(malicious);
    expect(sanitized).not.toContain("foreignObject");
    expect(sanitized).not.toContain("script");
  });

  it("handles empty or non-string inputs safely", () => {
    expect(sanitizeSvgXml("")).toBe("");
    expect(sanitizeSvgXml(null as unknown as string)).toBe("");
  });
});
