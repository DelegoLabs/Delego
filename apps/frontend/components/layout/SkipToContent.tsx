"use client";

import type { MouseEvent } from "react";
import { useTranslations } from "next-intl";

/** Id of the root layout's `<main>` landmark (app/layout.tsx). */
export const APP_CONTENT_ID = "app-content";

/**
 * Keyboard-accessible "skip to main content" link (WCAG 2.4.1, #1015).
 *
 * Rendered by app/layout.tsx as the first focusable element in the body and
 * hidden until focused (`.skip-to-content` in globals.css). Activating it
 * moves focus, not just scroll, into the main landmark so the next Tab
 * continues from inside the page content.
 */
export function SkipToContent() {
  const t = useTranslations("nav");

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    const target = document.getElementById(APP_CONTENT_ID);
    if (!target) return;
    event.preventDefault();
    target.focus();
    target.scrollIntoView?.({ block: "start" });
    window.history.replaceState(null, "", `#${APP_CONTENT_ID}`);
  };

  return (
    <a
      href={`#${APP_CONTENT_ID}`}
      className="skip-to-content focus-visible-ring"
      onClick={handleClick}
    >
      {t("skipToContent")}
    </a>
  );
}

export default SkipToContent;
