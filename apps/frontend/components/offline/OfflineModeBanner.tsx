"use client";

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
  const { isOffline } = useOnlineStatus();

  if (!isOffline) return null;

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
