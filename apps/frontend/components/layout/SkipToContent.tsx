"use client";

import { useTranslations } from "next-intl";

/**
 * Keyboard-accessible skip link that lets users jump straight to the main
 * content region, bypassing repeated navigation (WCAG 2.4.1).
 *
 * The link is visually hidden until it receives keyboard focus, at which
 * point it becomes visible and shows the high-contrast focus ring.
 */
export function SkipToContent() {
  const t = useTranslations("nav");

  return (
    <a href="#main-content" className="skip-to-content focus-visible-ring">
      {t("skipToContent")}
    </a>
  );
}
