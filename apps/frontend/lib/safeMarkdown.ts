/**
 * Safe rendering of untrusted Markdown (Issue #755).
 *
 * The agent surfaces render model-generated Markdown. Model output is
 * untrusted input: an adversarial merchant description or injected prompt
 * can carry `<img src=x onerror=…>`, `javascript:` links, `<script>` bodies
 * or `<iframe>` embeds. Any of those executing does so inside the signed-in
 * operator's session.
 *
 * `renderSafeMarkdown` converts Markdown to HTML and sanitizes it with
 * DOMPurify before it can touch the DOM, so `dangerouslySetInnerHTML`
 * consumers only ever receive inert markup:
 *
 *  - script/iframe/object/embed and SVG-with-script are removed entirely
 *  - every `on*` event-handler attribute is dropped
 *  - `javascript:`, `data:` (except inline images) and `vbscript:` URLs are
 *    stripped from `href`/`src`
 *  - links are forced to `target="_blank" rel="noopener noreferrer"` so a
 *    hostile page cannot get a `window.opener` reference back
 *
 * Issue #755
 */

import DOMPurify from "dompurify";
import { marked } from "marked";

/** Tags that must never survive sanitization. */
const FORBID_TAGS = [
  "script",
  "iframe",
  "object",
  "embed",
  "form",
  "base",
  "meta",
  "link",
];

/** Attributes that must never survive sanitization (event handlers et al). */
const FORBID_ATTR = ["style", "srcdoc", "formaction", "ping"];

export interface SafeMarkdownOptions {
  /**
   * Extra tags to allow beyond the default Markdown vocabulary
   * (headings, lists, tables, code, images, links, emphasis).
   */
  allowedTags?: string[];
  /**
   * Extra attributes to allow on specific tags, e.g. `{ a: ["class"] }`.
   */
  allowedAttributes?: Record<string, string[]>;
}

/** Markdown → HTML. `marked` output is untrusted until sanitized below. */
function markdownToHtml(markdown: string): string {
  return marked.parse(markdown, { async: false }) as string;
}

/**
 * Sanitizes rendered Markdown HTML. Exported for callers that already hold
 * HTML from a trusted Markdown renderer — prefer `renderSafeMarkdown` for
 * raw model output.
 */
export function sanitizeMarkdownHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    // Links open in a new tab without granting opener access (#755).
    ADD_ATTR: ["target", "rel"],
    FORBID_TAGS,
    FORBID_ATTR,
    ALLOWED_URI_REGEXP:
      /^(?:(?:https?|mailto|tel|ftp):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
  });
}

export function renderSafeMarkdown(
  content: string,
  options: SafeMarkdownOptions = {},
): string {
  if (typeof content !== "string" || content.trim() === "") {
    return "";
  }

  let html = markdownToHtml(content);

  if (options.allowedTags || options.allowedAttributes) {
    html = DOMPurify.sanitize(html, {
      ALLOWED_TAGS: options.allowedTags,
      ALLOWED_ATTR: options.allowedAttributes
        ? Object.keys(options.allowedAttributes).flatMap((tag) =>
            (options.allowedAttributes?.[tag] ?? []).map((attr) =>
              tag === "a" && attr === "target" ? "target" : attr,
            ),
          )
        : undefined,
      FORBID_TAGS,
      FORBID_ATTR,
    });
  } else {
    html = sanitizeMarkdownHtml(html);
  }

  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
  const container = doc.body.firstElementChild;
  if (!container) {
    return "";
  }

  // Defense-in-depth: after DOMPurify, enforce the link contract (#755) and
  // drop any residual on* attributes in one pass.
  for (const el of Array.from(container.querySelectorAll("*"))) {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      if (name.startsWith("on")) {
        el.removeAttribute(attr.name);
      }
    }

    if (el.tagName === "A") {
      const href = el.getAttribute("href") ?? "";
      const scheme = href.split(":")[0]?.toLowerCase() ?? "";
      if (/^\s*(javascript|vbscript|data)\s*:/.test(href)) {
        el.removeAttribute("href");
      } else if (scheme === "http" || scheme === "https" || href.startsWith("/")) {
        el.setAttribute("target", "_blank");
        el.setAttribute("rel", "noopener noreferrer");
      }
    }
  }

  return container.innerHTML;
}
