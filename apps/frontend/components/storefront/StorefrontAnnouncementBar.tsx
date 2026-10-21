"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import type {
  StoreAnnouncement,
  StoreAnnouncementType,
} from "../../lib/storefront";

const STORAGE_KEY = "delego_storefront_announcement_dismissed";

const TYPE_ICON: Record<StoreAnnouncementType, string> = {
  info: "ℹ️",
  warning: "⚠️",
  promotion: "📣",
};

/**
 * Merchant-authored banner at the top of a public storefront (#1007).
 *
 * Dismissal is stored per merchant as a fingerprint of the announcement text
 * and updatedAt, so a returning visitor keeps it hidden until the merchant
 * changes the message. That avoids a stale "Holiday shipping delays" banner
 * sticking around after the merchant clears it and later posts something new.
 */
export function StorefrontAnnouncementBar({
  merchantId,
  announcement,
}: {
  merchantId: string;
  announcement: StoreAnnouncement;
}) {
  const fingerprint = announcementFingerprint(announcement);
  const [dismissed, setDismissed] = useState(false);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    setDismissed(readDismissed(merchantId) === fingerprint);
    setClosing(false);
  }, [merchantId, fingerprint]);

  if (dismissed) return null;

  function handleDismiss() {
    saveDismissed(merchantId, fingerprint);
    setClosing(true);
    // Let the collapse transition finish before removing the banner.
    window.setTimeout(() => setDismissed(true), 200);
  }

  return (
    <div
      className={`announcement-banner storefront-announcement announcement-banner-${announcement.bannerType}${
        closing ? " closing" : ""
      }`}
      role="status"
      aria-live="polite"
      aria-label="Store announcement"
    >
      <span className="announcement-banner-icon" aria-hidden="true">
        {TYPE_ICON[announcement.bannerType]}
      </span>
      <span className="announcement-banner-message">{announcement.text}</span>
      {announcement.linkUrl && (
        <Link
          className="announcement-banner-link"
          href={announcement.linkUrl}
          prefetch={false}
        >
          Learn more
        </Link>
      )}
      <button
        type="button"
        className="announcement-banner-dismiss"
        onClick={handleDismiss}
        aria-label="Dismiss announcement"
      >
        ✕
      </button>
    </div>
  );
}

export function announcementFingerprint(
  announcement: StoreAnnouncement
): string {
  const input = `${announcement.text}|${announcement.updatedAt}`;
  let hash = 5381;
  for (let index = 0; index < input.length; index += 1) {
    hash = ((hash << 5) + hash + input.charCodeAt(index)) >>> 0;
  }
  return hash.toString(36);
}

function readDismissed(merchantId: string): string | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    const value = (parsed as Record<string, unknown>)[merchantId];
    return typeof value === "string" ? value : null;
  } catch {
    return null;
  }
}

function saveDismissed(merchantId: string, fingerprint: string): void {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    let store: Record<string, string> = {};
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        store = Object.fromEntries(
          Object.entries(parsed).filter(
            (entry): entry is [string, string] => typeof entry[1] === "string"
          )
        );
      }
    }
    store[merchantId] = fingerprint;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Ignore quota / privacy-mode errors; the banner just won't persist.
  }
}
