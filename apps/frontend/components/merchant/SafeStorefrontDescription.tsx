"use client";

import React, { useMemo } from "react";
import { sanitizeStorefrontHtml } from "../../lib/sanitizeStorefrontHtml";

export interface SafeHtmlRendererProps {
  dirtyHtml: string;
  allowedTags?: string[];
  containerClassName?: string;
}

/**
 * SafeStorefrontDescription (Issue #1026).
 *
 * Renders merchant-provided storefront HTML descriptions securely by sanitizing
 * against DOM-based XSS attacks using an aggressive DOMPurify configuration.
 */
export function SafeStorefrontDescription({
  dirtyHtml,
  allowedTags,
  containerClassName,
}: SafeHtmlRendererProps) {
  const sanitizedHtml = useMemo(
    () => sanitizeStorefrontHtml(dirtyHtml, { allowedTags }),
    [dirtyHtml, allowedTags]
  );

  if (!sanitizedHtml) {
    return null;
  }

  return (
    <div
      className={containerClassName}
      data-testid="safe-storefront-description"
      dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
    />
  );
}
