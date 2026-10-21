/**
 * Safe rendering of untrusted Markdown / HTML / SVG (Issue #755, hardened in
 * Issue #4 — Hardened Markdown & HTML Sanitization Wrapper).
 *
 * The agent surfaces render model-generated Markdown. Model output is
 * untrusted input: an adversarial merchant description or injected prompt
 * can carry `<img src=x onerror=…>`, `javascript:` links, `<script>` bodies,
 * `<iframe>` embeds or hostile SVG. Any of those executing does so inside the
 * signed-in operator's session.
 *
 * Strategy: convert Markdown to HTML with `marked`, then sanitize with
 * DOMPurify against an explicit `SanitizerConfig`. Only `https:` and
 * `web+stellar:` link protocols (plus same-origin relative URLs) survive;
 * every other scheme is stripped. A DOMPurify `afterSanitizeAttributes` hook
 * enforces `target="_blank"` / `rel="noopener noreferrer"` on every surviving
 * link so a hostile page can never reach back through `window.opener`.
 */

import DOMPurify from "dompurify";
import { marked } from "marked";

/** Link protocols permitted after sanitization. */
export const ALLOWED_LINK_SCHEMES = ["https:", "web+stellar:"] as const;

export interface SanitizerConfig {
  /** Tag whitelist. */
  allowedTags: string[];
  /** Per-tag attribute whitelist. */
  allowedAttributes: Record<string, string[]>;
  /** Permitted URL protocols (lower-case, colon-terminated). */
  allowedSchemes: string[];
  /**
   * When true, the *content* of a disallowed tag is removed too (e.g. the text
   * inside `<script>`); when false, only the tag is dropped and its text kept.
   */
  stripIgnoreTag: boolean;
}

/** Markdown vocabulary (`marked`) plus tables and strikethrough. */
const MARKDOWN_ALLOWED_TAGS = [
  "h1", "h2", "h3", "h4", "h5", "h6",
  "p", "br", "hr", "blockquote", "pre", "code",
  "strong", "em", "b", "i", "u", "s", "del", "ins", "mark", "sub", "sup", "small",
  "ul", "ol", "li", "dl", "dt", "dd",
  "a", "img", "figure", "figcaption",
  "table", "thead", "tbody", "tfoot", "tr", "th", "td",
  "span", "div", "section", "article",
];

const MARKDOWN_ALLOWED_ATTRIBUTES: Record<string, string[]> = {
  a: ["href", "title", "target", "rel"],
  img: ["src", "alt", "title", "width", "height"],
  code: ["class"],
  span: ["class"],
  div: ["class"],
  td: ["colspan", "rowspan", "align"],
  th: ["colspan", "rowspan", "align", "scope"],
};

/** Sensible defaults for rendering agent/Markdown output. */
export const DEFAULT_SANITIZER_CONFIG: SanitizerConfig = {
  allowedTags: MARKDOWN_ALLOWED_TAGS,
  allowedAttributes: MARKDOWN_ALLOWED_ATTRIBUTES,
  allowedSchemes: [...ALLOWED_LINK_SCHEMES],
  stripIgnoreTag: true,
};

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
  "style",
  "foreignObject",
];

/** Attributes that must never survive sanitization (event handlers et al). */
const FORBID_ATTR = ["style", "srcdoc", "formaction", "ping"];

/**
 * Builds the DOMPurify URL-matching regexp from the allowed schemes, keeping
 * DOMPurify's relative/fragment allowance (`/orders`, `#top`, `foo/bar`).
 */
function buildUriRegexp(allowedSchemes: string[]): RegExp {
  const schemeAlternation = allowedSchemes
    .map((scheme) => scheme.replace(/\+/g, "\\+"))
    .join("|");
  return new RegExp(
    `^(?:(?:${schemeAlternation})|[^a-z]|[a-z+.\\-]+(?:[^a-z+.\\-:]|$))`,
    "i"
  );
}

/**
 * Whether an href uses a permitted protocol. Relative URLs (no scheme) and
 * same-page fragments are allowed; everything else — `javascript:`, `data:`,
 * `http:`, `mailto:`, … — is not.
 */
export function isAllowedLinkHref(
  href: string,
  allowedSchemes: string[] = [...ALLOWED_LINK_SCHEMES]
): boolean {
  const trimmed = href.trim();
  if (trimmed === "") return false;
  const schemeMatch = /^([a-z][a-z0-9+.\-]*):/i.exec(trimmed);
  if (!schemeMatch) return true; // no scheme → relative / fragment
  const scheme = `${schemeMatch[1].toLowerCase()}:`;
  return allowedSchemes.some((allowed) => allowed.toLowerCase() === scheme);
}

// Registered once for the lifetime of the module. DOMPurify hooks are global,
// so every sanitize call — including SVG — benefits from the hardened link
// contract and defensive on* stripping.
let hooksRegistered = false;
function registerHooks(): void {
  if (hooksRegistered) return;
  hooksRegistered = true;

  DOMPurify.addHook("afterSanitizeAttributes", (node) => {
    if (node.nodeType !== 1) return;
    const el = node as Element;

    // Defense-in-depth: drop any residual inline event handler.
    for (const attr of Array.from(el.attributes)) {
      if (attr.name.toLowerCase().startsWith("on")) {
        el.removeAttribute(attr.name);
      }
    }

    if (el.tagName.toUpperCase() === "A") {
      const href = el.getAttribute("href");
      if (href === null) return;
      if (isAllowedLinkHref(href)) {
        el.setAttribute("target", "_blank");
        el.setAttribute("rel", "noopener noreferrer");
      } else {
        el.removeAttribute("href");
      }
    }
  });
}

/** Markdown → HTML. `marked` output is untrusted until sanitized below. */
function markdownToHtml(markdown: string): string {
  return marked.parse(markdown, { async: false }) as string;
}

/**
 * Sanitizes HTML using an explicit `SanitizerConfig`. Prefer this (or
 * `renderSafeMarkdown`) over touching DOMPurify directly so the link contract
 * stays consistent across the app.
 */
export function sanitizeWithConfig(
  html: string,
  config: SanitizerConfig = DEFAULT_SANITIZER_CONFIG
): string {
  registerHooks();
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: config.allowedTags,
    ALLOWED_ATTR: Object.values(config.allowedAttributes).flat(),
    ADD_ATTR: ["target", "rel"],
    FORBID_TAGS,
    FORBID_ATTR,
    // `stripIgnoreTag` drops the *content* of an ignored tag, not just the tag.
    // It must NOT be mapped onto `KEEP_CONTENT: false`: DOMPurify only
    // allow-lists "#text" while KEEP_CONTENT is true, so that would strip every
    // text node in the document, not merely the ignored tag's. Adding the
    // forbidden tags to FORBID_CONTENTS is additive, so the built-in
    // script/style protection is preserved.
    KEEP_CONTENT: true,
    ADD_FORBID_CONTENTS: config.stripIgnoreTag ? FORBID_TAGS : undefined,
    ALLOWED_URI_REGEXP: buildUriRegexp(config.allowedSchemes),
  });
}

/**
 * Sanitizes HTML from a trusted Markdown renderer, enforcing the default link
 * contract (Issue #755). Exported for callers that already hold HTML — prefer
 * `renderSafeMarkdown` for raw model output.
 */
export function sanitizeMarkdownHtml(html: string): string {
  registerHooks();
  return DOMPurify.sanitize(html, {
    ADD_ATTR: ["target", "rel"],
    FORBID_TAGS,
    FORBID_ATTR,
    ALLOWED_URI_REGEXP: buildUriRegexp([...ALLOWED_LINK_SCHEMES]),
  });
}

/**
 * Sanitizes an SVG document/string: embedded `<script>`, `<foreignObject>`,
 * event handlers and unlisted attributes are removed using DOMPurify's SVG
 * profile. Returns an empty string for empty/invalid input.
 */
export function sanitizeSvg(svg: string): string {
  if (typeof svg !== "string" || svg.trim() === "") return "";
  registerHooks();
  return DOMPurify.sanitize(svg, {
    USE_PROFILES: { svg: true, svgFilters: true },
    FORBID_TAGS,
    FORBID_ATTR,
    FORBID_CONTENTS: ["script", "style"],
  });
}

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
  /** Full sanitizer config; overrides `allowedTags`/`allowedAttributes`. */
  config?: SanitizerConfig;
}

export function renderSafeMarkdown(
  content: string,
  options: SafeMarkdownOptions = {}
): string {
  if (typeof content !== "string" || content.trim() === "") {
    return "";
  }

  registerHooks();
  const html = markdownToHtml(content);

  if (options.config) {
    return sanitizeWithConfig(html, options.config);
  }

  if (options.allowedTags || options.allowedAttributes) {
    return DOMPurify.sanitize(html, {
      ALLOWED_TAGS: options.allowedTags,
      ALLOWED_ATTR: options.allowedAttributes
        ? Object.values(options.allowedAttributes).flat()
        : undefined,
      ADD_ATTR: ["target", "rel"],
      FORBID_TAGS,
      FORBID_ATTR,
      ALLOWED_URI_REGEXP: buildUriRegexp([...ALLOWED_LINK_SCHEMES]),
    });
  }

  return sanitizeMarkdownHtml(html);
}
