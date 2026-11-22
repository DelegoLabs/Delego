"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { Button, Card } from "@delegolabs/ui";
import { listCachedReads, type CachedRead } from "../../lib/offlineCache";

/**
 * Formats a date as a locale-aware relative or short timestamp.
 * Uses the active locale from the browser or falls back to 'en'.
 */
function formatCachedTime(date: Date, locale: string): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) {
    return "Just now";
  }
  if (diffMins < 60) {
    return `${diffMins}m ago`;
  }
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }
  if (diffDays < 7) {
    return `${diffDays}d ago`;
  }
  return date.toLocaleDateString(locale, { month: "short", day: "numeric" });
}

/**
 * Branded offline fallback — the service worker serves this for any
 * navigation that fails with no cached copy of its own (see
 * handleNavigate in public/sw.js). Lists what's still available to read
 * from Cache Storage so "offline" isn't a dead end.
 */
export default function OfflinePage() {
  const t = useTranslations("offline.page");
  const tCommon = useTranslations("common");
  const [reads, setReads] = useState<CachedRead[] | null>(null);

  useEffect(() => {
    listCachedReads().then(setReads);
  }, []);

  const locale = typeof navigator !== "undefined" ? navigator.language : "en";

  return (
    <div className="settings-page">
      <header className="header">
        <h1>{t("title")}</h1>
        <p>{t("description")}</p>
      </header>

      <Card title={t("availableTitle")}>
        {reads === null ? (
          <p>{t("checking")}</p>
        ) : reads.length === 0 ? (
          <p>{t("empty")}</p>
        ) : (
          <ul className="offline-cached-list">
            {reads.map((read) => (
              <li key={read.url}>
                <Link
                  href={read.url}
                  className="offline-cached-link"
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.25rem",
                    padding: "0.5rem",
                    borderRadius: "0.375rem",
                    textDecoration: "none",
                    color: "inherit",
                    transition: "background-color 0.15s ease",
                  }}
                >
                  <span className="offline-cached-label">{read.label}</span>
                  {read.cachedAt && (
                    <span
                      className="offline-cached-time"
                      style={{ fontSize: "0.75rem", color: "#6b7280" }}
                    >
                      {t("savedAt", { time: formatCachedTime(read.cachedAt, locale) })}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Button onClick={() => window.location.reload()}>
        {tCommon("tryAgain")}
      </Button>
    </div>
  );
}
