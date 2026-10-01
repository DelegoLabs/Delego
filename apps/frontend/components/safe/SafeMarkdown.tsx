/**
 * Safe Markdown renderer for AI/agent output (Issue #755).
 *
 * React wrapper around `renderSafeMarkdown` (see lib/safeMarkdown.ts): model
 * output is untrusted, so it is converted to HTML and sanitized with DOMPurify
 * before being injected. Use this instead of rendering raw LLM Markdown with
 * `dangerouslySetInnerHTML`.
 *
 * Issue #755
 */

import { useMemo } from "react";
import { renderSafeMarkdown } from "../../lib/safeMarkdown";

export interface SafeMarkdownProps {
  content: string;
  allowedTags?: string[];
  allowedAttributes?: Record<string, string[]>;
  /** Test id for the rendered container. */
  testId?: string;
}

export function SafeMarkdown({
  content,
  allowedTags,
  allowedAttributes,
  testId,
}: SafeMarkdownProps) {
  const html = useMemo(
    () => renderSafeMarkdown(content, { allowedTags, allowedAttributes }),
    [content, allowedTags, allowedAttributes],
  );

  return (
    <div
      className="safe-markdown"
      data-testid={testId}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
