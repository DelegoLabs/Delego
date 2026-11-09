import DOMPurify from "dompurify";

export const DEFAULT_ALLOWED_STOREFRONT_TAGS = [
  "b",
  "i",
  "em",
  "strong",
  "p",
  "ul",
  "ol",
  "li",
  "br",
] as const;

export interface SanitizeStorefrontHtmlOptions {
  allowedTags?: string[];
}

/**
 * Aggressive DOMPurify sanitizer for merchant storefront custom HTML descriptions (Issue #1026).
 *
 * Allows only safe formatting tags (b, i, em, strong, p, ul, ol, li, br)
 * and strips dangerous tags (script, iframe, object, embed, svg, style, etc.)
 * as well as all inline JavaScript event handlers (onload, onerror, onclick, etc.)
 * and JavaScript/Data URIs.
 */
export function sanitizeStorefrontHtml(
  dirtyHtml: string | null | undefined,
  options: SanitizeStorefrontHtmlOptions = {}
): string {
  if (!dirtyHtml || typeof dirtyHtml !== "string") {
    return "";
  }

  const allowedTags = options.allowedTags ?? [...DEFAULT_ALLOWED_STOREFRONT_TAGS];

  return DOMPurify.sanitize(dirtyHtml, {
    ALLOWED_TAGS: allowedTags,
    ALLOWED_ATTR: ["class"],
    FORBID_TAGS: [
      "script",
      "iframe",
      "object",
      "embed",
      "form",
      "input",
      "button",
      "base",
      "meta",
      "link",
      "style",
      "svg",
      "math",
      "applet",
      "template",
    ],
    FORBID_ATTR: [
      "style",
      "src",
      "href",
      "action",
      "formaction",
      "srcdoc",
      "ping",
      "xlink:href",
    ],
    ALLOW_DATA_ATTR: false,
    SANITIZE_DOM: true,
    KEEP_CONTENT: true,
  });
}
