"use client";

import { useEffect, useRef, useState } from "react";
import { useNotifications } from "../../hooks/useNotifications";
import { NotificationCenter } from "./NotificationCenter";

/**
 * Header bell button with an unread-count badge that toggles the in-app
 * NotificationCenter. Closes on outside click or Escape.
 */
export function NotificationBell() {
  const { unreadCount } = useNotifications();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const hasUnread = unreadCount > 0;
  const badgeLabel = unreadCount > 99 ? "99+" : String(unreadCount);

  return (
    <div className="notification-bell" ref={containerRef}>
      <button
        type="button"
        className="notification-bell-button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={
          hasUnread
            ? `Notifications, ${unreadCount} unread`
            : "Notifications"
        }
      >
        <span className="notification-bell-icon" aria-hidden="true">
          🔔
        </span>
        {hasUnread && (
          <span className="notification-bell-badge" aria-hidden="true">
            {badgeLabel}
          </span>
        )}
      </button>

      {open && <NotificationCenter onClose={() => setOpen(false)} />}
    </div>
  );
}
