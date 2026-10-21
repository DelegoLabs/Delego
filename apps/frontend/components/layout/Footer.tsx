"use client";

import { LocaleSelector } from "./LocaleSelector";

/**
 * Application footer (Issue #1). Hosts the global locale switcher so the
 * language can be changed from anywhere without a trip to settings.
 */
export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="app-footer">
      <p className="app-footer-copy">© {year} Delego</p>
      <LocaleSelector />
    </footer>
  );
}
