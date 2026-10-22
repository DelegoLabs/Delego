/**
 * Safe outbound link (#1018).
 *
 * Every link that leaves the app goes through this component so the same
 * guarantees hold everywhere:
 * - Script-capable schemes (`javascript:`, `data:`, `vbscript:`, `file:`,
 *   `blob:`) are never rendered as a live link — the label is shown as
 *   disabled text instead.
 * - With `validateProtocol` (the default) only HTTPS links are rendered;
 *   plain `http:` URLs are upgraded to `https:` and anything else is disabled.
 * - Live links always open in a new tab with `rel="noopener noreferrer"` so
 *   the destination can't reach back via `window.opener` or read the
 *   referring URL.
 */

import type { SVGProps } from "react";

export interface SafeExternalLinkProps {
  href: string;
  label: string;
  validateProtocol?: boolean;
}

/** Schemes that can execute script or smuggle content — always blocked. */
export const BLOCKED_PROTOCOLS: ReadonlySet<string> = new Set([
  "javascript:",
  "data:",
  "vbscript:",
  "file:",
  "blob:",
]);

/**
 * Resolves `href` into the URL that is safe to render, or `null` when the link
 * must be disabled. Relative URLs are rejected — this component is for
 * external destinations only.
 */
export function resolveSafeExternalHref(
  href: string,
  validateProtocol = true
): string | null {
  // Browsers ignore ASCII control chars and surrounding whitespace in hrefs
  // (e.g. "java\tscript:"), so strip them before deciding anything.
  // eslint-disable-next-line no-control-regex
  const cleaned = href.replace(/[\u0000-\u001F\u007F]/g, "").trim();
  if (!cleaned) return null;

  let url: URL;
  try {
    url = new URL(cleaned);
  } catch {
    return null;
  }

  const protocol = url.protocol.toLowerCase();
  if (BLOCKED_PROTOCOLS.has(protocol)) return null;

  if (!validateProtocol) return url.toString();

  if (protocol === "http:") {
    url.protocol = "https:";
    return url.toString();
  }
  return protocol === "https:" ? url.toString() : null;
}

/** "Opens in a new tab" indicator shown after every live external link. */
export function ExternalLinkIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      data-testid="external-link-icon"
      {...props}
    >
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}

export function SafeExternalLink({
  href,
  label,
  validateProtocol = true,
}: SafeExternalLinkProps) {
  const safeHref = resolveSafeExternalHref(href, validateProtocol);

  if (!safeHref) {
    return (
      <span
        role="link"
        aria-disabled="true"
        title="This link was blocked because it uses an unsafe address."
        data-testid="safe-external-link-blocked"
        style={{
          color: "var(--color-text-tertiary, #9ca3af)",
          cursor: "not-allowed",
          textDecoration: "line-through",
        }}
      >
        {label}
      </span>
    );
  }

  return (
    <a
      href={safeHref}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.25rem",
        color: "var(--color-accent, #2563eb)",
        textDecoration: "underline",
      }}
    >
      {label}
      <ExternalLinkIcon />
      <span
        style={{
          position: "absolute",
          width: 1,
          height: 1,
          overflow: "hidden",
          clip: "rect(0 0 0 0)",
          whiteSpace: "nowrap",
        }}
      >
        (opens in a new tab)
      </span>
    </a>
  );
}

export default SafeExternalLink;
