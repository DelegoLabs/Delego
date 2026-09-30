/**
 * Sanitization of user-uploaded SVG merchant logos (Issue #758).
 *
 * Unsanitized SVG files can carry embedded JavaScript — `<script>` bodies,
 * `<svg onload=...>`-style event handlers, `<foreignObject>` HTML islands,
 * `javascript:` URLs — which executes in the storefront visitor's session
 * when the logo is displayed inline.
 *
 * `sanitizeSvgXml` strips every executable payload while preserving plain
 * vector content (paths, shapes, fills, gradients), so a sanitized logo
 * renders identically without any script surface.
 *
 * The primary path uses DOMPurify with the SVG profile; a defensive regex
 * pass catches payloads DOMPurify's parser may not classify as dangerous
 * (e.g. inside CDATA sections) so output is inert even if the sanitizer
 * configuration drifts.
 *
 * Issue #758
 */

import DOMPurify from "dompurify";

/**
 * Tags that have no business in a merchant logo. DOMPurify's SVG profile
 * already drops most of these; the explicit blocklist documents intent and
 * keeps them out if profiles are ever widened.
 */
const FORBIDDEN_TAGS = [
  "script",
  "foreignObject",
  "iframe",
  "embed",
  "object",
  "animate",
  "animateTransform",
  "set",
  "handler",
];

/**
 * Attribute names that can execute code: inline event handlers
 * (`onload`, `onclick`, …) and URL-bearing attributes that accept
 * `javascript:` values. Matched case-insensitively.
 */
const FORBIDDEN_ATTRIBUTE_PATTERN =
  /\s(on[a-z]+|href|xlink:href|src|style)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi;

export function sanitizeSvgXml(rawSvgString: string): string {
  if (typeof rawSvgString !== "string" || rawSvgString.trim() === "") {
    return "";
  }

  // 1. Primary sanitization: DOMPurify restricted to the SVG profiles.
  //    This removes <script>, event handler attributes, foreignObject
  //    children, and anything outside the SVG vocabulary.
  let sanitized = DOMPurify.sanitize(rawSvgString, {
    USE_PROFILES: { svg: true, svgFilters: true },
    FORBID_TAGS: FORBIDDEN_TAGS,
    FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover", "style"],
  });

  // 2. Defensive pass: neutralize any executable remnants the parser-based
  //    sanitization may not classify as dangerous (CDATA-wrapped script,
  //    case-mangled handlers, javascript: URLs inside attribute values).
  sanitized = sanitized.replace(/<\s*script[\s\S]*?(<\/\s*script\s*>|$)/gi, "");
  for (const tag of FORBIDDEN_TAGS) {
    sanitized = sanitized.replace(
      new RegExp(`<\\s*/?\\s*${tag}\\b[^>]*>`, "gi"),
      "",
    );
  }
  sanitized = sanitized.replace(FORBIDDEN_ATTRIBUTE_PATTERN, "");

  // 3. javascript:/data: URLs in href/src-ish attributes (second pass covers
  //    attributes that survived step 2 with safe names).
  sanitized = sanitized.replace(
    /\s(href|xlink:href|src)\s*=\s*("|')\s*(javascript|data):[^"']*\2/gi,
    "",
  );

  return sanitized;
}

/**
 * Validates that a string still looks like an SVG document after
 * sanitization. Uploads whose sanitized output no longer contains a root
 * <svg> element were either not SVGs to begin with or were so heavily
 * weaponized that nothing usable remains — callers should reject them
 * instead of storing a broken asset.
 */
export function isSanitizableSvg(sanitized: string): boolean {
  return /<svg[\s>]/i.test(sanitized);
}
