"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button, Card } from "@delegolabs/ui";
import { listCachedReads, type CachedRead } from "../../lib/offlineCache";

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
                <span className="offline-cached-label">{read.label}</span>
                {read.cachedAt && (
                  <span className="offline-cached-time">
                    {t("savedAt", { time: read.cachedAt.toLocaleString() })}
                  </span>
                )}
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
