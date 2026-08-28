"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge, type BadgeTone } from "@delegolabs/ui";
import {
  useAnnouncements,
  type AnnouncementSeverity,
} from "../../hooks/useAnnouncements";

const SEVERITY_TONE: Record<AnnouncementSeverity, BadgeTone> = {
  info: "info",
  success: "success",
  warning: "warning",
};

const SEVERITY_ICON: Record<AnnouncementSeverity, string> = {
  info: "ℹ️",
  success: "✅",
  warning: "⚠️",
};

const SEVERITY_LABEL: Record<AnnouncementSeverity, string> = {
  info: "Info",
  success: "New",
  warning: "Warning",
};

/**
 * Full-width banner surfaced above the app shell for the most recent
 * undismissed announcement. Dismissal is persisted per announcement id
 * (see useAnnouncements) so it never resurfaces, while a new id always shows.
 *
 * Rendered outside the app-shell grid so its collapse/close never shifts the
 * sidebar or content columns — only the space it itself occupies changes.
 */
export function AnnouncementBanner() {
  const { announcements, dismiss } = useAnnouncements();
  const [closingId, setClosingId] = useState<string | null>(null);

  const announcement = announcements[0];
  if (!announcement) return null;

  const isClosing = closingId === announcement.id;

  function handleDismiss() {
    if (!announcement) return;
    setClosingId(announcement.id);
    // Let the collapse transition play before removing it from the DOM.
    window.setTimeout(() => dismiss(announcement.id), 200);
  }

  return (
    <div
      className={`announcement-banner announcement-banner-${announcement.severity}${
        isClosing ? " closing" : ""
      }`}
      role="status"
    >
      <span className="announcement-banner-icon" aria-hidden="true">
        {SEVERITY_ICON[announcement.severity]}
      </span>
      <Badge tone={SEVERITY_TONE[announcement.severity]}>
        {SEVERITY_LABEL[announcement.severity]}
      </Badge>
      <span className="announcement-banner-message">
        {announcement.message}
      </span>
      {announcement.link && (
        // Rare, dismissible, content-driven link — most announcements are
        // dismissed unread, so eager prefetch would be wasted bandwidth on
        // every page load (#621).
        <Link
          className="announcement-banner-link"
          href={announcement.link}
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
