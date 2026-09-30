import DOMPurify from "dompurify";

/**
 * Sanitizes raw SVG XML string using DOMPurify with SVG profiles,
 * stripping all embedded <script> tags, foreign objects, and event attributes.
 * Meets requirements for issue #758.
 */
export function sanitizeSvgXml(rawSvgString: string): string {
  if (!rawSvgString || typeof rawSvgString !== "string") {
    return "";
  }
  return DOMPurify.sanitize(rawSvgString, {
    USE_PROFILES: { svg: true, svgFilters: true },
  });
}
