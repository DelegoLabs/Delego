"use client";

import { useTranslations } from "next-intl";
import { LocaleSelector } from "./LocaleSelector";

/**
 * Application footer (Issue #1). Hosts the global locale switcher so the
 * language can be changed from anywhere without a trip to settings.
 */
export function Footer() {
  const t = useTranslations("footer");
  const year = new Date().getFullYear();

  return (
    <footer className="app-footer">
      <p className="app-footer-copy">{t("copyright", { year })}</p>
      <nav className="app-footer-links" aria-label={t("navigationLabel")}>
        <a href="https://delego.app/privacy">{t("privacy")}</a>
        <a href="https://delego.app/terms">{t("terms")}</a>
        <a href="https://status.delego.app">{t("status")}</a>
      </nav>
      <LocaleSelector />
    </footer>
  );
}
