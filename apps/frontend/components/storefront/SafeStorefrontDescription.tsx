"use client";

import React, { useMemo } from "react";
import DOMPurify from "dompurify";

export interface SafeHtmlRendererProps {
  dirtyHtml: string;
  allowedTags?: string[];
  containerClassName?: string;
  testId?: string;
}

export const DEFAULT_ALLOWED_TAGS = [
  "b",
  "i",
  "em",
  "strong",
  "p",
  "ul",
  "li",
  "br",
];

export const FORBIDDEN_TAGS = [
  "script",
  "iframe",
  "object",
  "embed",
  "form",
  "input",
  "button",
  "svg",
  "math",
  "base",
  "meta",
  "link",
  "style",
];

export const FORBIDDEN_ATTRS = [
  "style",
  "srcdoc",
  "formaction",
  "ping",
  "onerror",
  "onload",
  "onclick",
  "onmouseover",
  "onfocus",
  "onblur",
  "onchange",
  "onsubmit",
];

/**
 * Sanitizes untrusted merchant storefront custom HTML descriptions (Issue #1026).
 * Enforces a strict whitelist of formatting tags (<b>, <i>, <em>, <strong>, <p>, <ul>, <li>, <br>)
 * and strips all script tags, event handlers, and javascript: protocols.
 */
export function sanitizeStorefrontHtml(
  dirtyHtml: string,
  allowedTags: string[] = DEFAULT_ALLOWED_TAGS
): string {
  if (!dirtyHtml || typeof dirtyHtml !== "string") {
    return "";
  }

  return DOMPurify.sanitize(dirtyHtml, {
    ALLOWED_TAGS: allowedTags,
    ALLOWED_ATTR: [],
    FORBID_TAGS: FORBIDDEN_TAGS,
    FORBID_ATTR: FORBIDDEN_ATTRS,
    ALLOW_DATA_ATTR: false,
    KEEP_CONTENT: true,
  });
}

/**
 * Component to safely render merchant custom rich-text HTML descriptions with XSS protection.
 */
export const SafeStorefrontDescription: React.FC<SafeHtmlRendererProps> = ({
  dirtyHtml,
  allowedTags = DEFAULT_ALLOWED_TAGS,
  containerClassName = "storefront-description prose prose-sm text-foreground/90 leading-relaxed",
  testId = "safe-storefront-description",
}) => {
  const sanitizedHtml = useMemo(
    () => sanitizeStorefrontHtml(dirtyHtml, allowedTags),
    [dirtyHtml, allowedTags]
  );

  if (!sanitizedHtml) {
    return null;
  }

  return (
    <div
      data-testid={testId}
      className={containerClassName}
      dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
    />
  );
};

export default SafeStorefrontDescription;
