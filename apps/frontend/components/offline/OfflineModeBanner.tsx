"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useOnlineStatus } from "../../hooks/useOnlineStatus";

/**
 * Amber "browse only" banner shown whenever the browser reports no
 * connectivity (#773). Storefront/catalog pages stay browsable from the
 * service worker cache, but mutating CTAs (checkout/deposit) are disabled,
 * so this sets expectations rather than blocking navigation.
 *
 * Client-only and driven by `useOnlineStatus`, whose server/first-render
 * default is "online" — so it starts hidden and reveals itself after
 * hydration once the real connectivity is known, avoiding a mismatch.
 * Mounted from `app/layout.tsx` so it spans store, catalog and merchant
 * routes alike.
 */
export function OfflineModeBanner() {
  const t = useTranslations("offline");
  const { connectionStatus } = useOnlineStatus();
  const wasOffline = useRef(false);
  const [showBackOnline, setShowBackOnline] = useState(false);

  useEffect(() => {
    if (connectionStatus !== "online") {
      wasOffline.current = true;
      setShowBackOnline(false);
      return;
    }

    if (!wasOffline.current) return;
    wasOffline.current = false;
    setShowBackOnline(true);

    const timeout = window.setTimeout(() => setShowBackOnline(false), 5000);
    return () => window.clearTimeout(timeout);
  }, [connectionStatus]);

  if (connectionStatus === "online") {
    if (!showBackOnline) return null;
    return (
      <div className="back-online-toast" role="status" aria-live="polite">
        <span aria-hidden="true">✓</span>
        <span>{t("backOnline")}</span>
      </div>
    );
  }

  return (
    <div
      className="offline-mode-banner"
      role="status"
      aria-live="polite"
    >
      <span className="offline-mode-banner-icon" aria-hidden="true">
        📡
      </span>
      <span>{t("banner")}</span>
    </div>
  );
}
