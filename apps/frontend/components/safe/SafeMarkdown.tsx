/**
 * SafeMarkdownRenderer (Issue #4, superseding the #755 SafeMarkdown wrapper).
 *
 * React wrapper around `renderSafeMarkdown` / `sanitizeSvg` (see
 * lib/safeMarkdown.ts): model and user output is untrusted, so it is converted
 * to HTML and sanitized with DOMPurify before being injected. Use this instead
 * of rendering raw LLM Markdown/HTML/SVG with `dangerouslySetInnerHTML`.
 *
 * Issue #755, Issue #4
 */

"use client";

import { useMemo } from "react";
import {
  renderSafeMarkdown,
  sanitizeSvg,
  type SanitizerConfig,
} from "../../lib/safeMarkdown";

export type SafeMarkdownVariant = "markdown" | "svg";

export interface SafeMarkdownRendererProps {
  content: string;
  /** Treat `content` as Markdown (default) or as an SVG document. */
  variant?: SafeMarkdownVariant;
  /** Full sanitizer config; overrides the tag/attribute hints below. */
  config?: SanitizerConfig;
  allowedTags?: string[];
  allowedAttributes?: Record<string, string[]>;
  /** Test id for the rendered container. */
  testId?: string;
  /** Extra class names appended to the container. */
  className?: string;
}

export function SafeMarkdownRenderer({
  content,
  variant = "markdown",
  config,
  allowedTags,
  allowedAttributes,
  testId,
  className,
}: SafeMarkdownRendererProps) {
  const html = useMemo(
    () =>
      variant === "svg"
        ? sanitizeSvg(content)
        : renderSafeMarkdown(content, { config, allowedTags, allowedAttributes }),
    [content, variant, config, allowedTags, allowedAttributes]
  );

  return (
    <div
      className={className ? `safe-markdown ${className}` : "safe-markdown"}
      data-testid={testId}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
