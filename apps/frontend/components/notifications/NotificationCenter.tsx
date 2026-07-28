"use client";

import Link from "next/link";
import type { AppNotification, NotificationType } from "../../hooks/useNotifications";
import { useNotifications } from "../../hooks/useNotifications";

const TYPE_ICON: Record<NotificationType, string> = {
  info: "ℹ️",
  success: "✅",
  warning: "⚠️",
  error: "⛔",
};

function formatRelativeTime(timestamp: number): string {
  const diffMs = Date.now() - timestamp;
  const diffSec = Math.round(diffMs / 1000);
  if (diffSec < 60) return "just now";
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

interface NotificationItemProps {
  notification: AppNotification;
  onClose: () => void;
}

function NotificationItem({ notification, onClose }: NotificationItemProps) {
  const { markAsRead, remove } = useNotifications();

  function handleActivate() {
    markAsRead(notification.id);
    if (notification.href) onClose();
  }

  const body = (
    <>
      <span className="notification-item-icon" aria-hidden="true">
        {TYPE_ICON[notification.type]}
      </span>
      <span className="notification-item-body">
        <span className="notification-item-title">{notification.title}</span>
        {notification.message && (
          <span className="notification-item-message">
            {notification.message}
          </span>
        )}
        <span className="notification-item-time">
          {formatRelativeTime(notification.createdAt)}
        </span>
      </span>
    </>
  );

  return (
    <li
      className={`notification-item${notification.read ? "" : " unread"}`}
      data-type={notification.type}
    >
      {notification.href ? (
        <Link
          href={notification.href}
          className="notification-item-main"
          onClick={handleActivate}
        >
          {body}
        </Link>
      ) : (
        <button
          type="button"
          className="notification-item-main"
          onClick={handleActivate}
        >
          {body}
        </button>
      )}
      <button
        type="button"
        className="notification-item-dismiss"
        aria-label="Dismiss notification"
        onClick={() => remove(notification.id)}
      >
        ✕
      </button>
    </li>
  );
}

export interface NotificationCenterProps {
  /** Close the panel (used after navigating from an item). */
  onClose: () => void;
}

/**
 * Dropdown panel listing in-app notifications with mark-all-read and clear-all
 * controls. Rendered by NotificationBell when the bell is open.
 */
export function NotificationCenter({ onClose }: NotificationCenterProps) {
  const { notifications, unreadCount, markAllAsRead, clearAll } =
    useNotifications();

  return (
    <div
      className="notification-center"
      role="dialog"
      aria-label="Notifications"
    >
      <div className="notification-center-header">
        <span className="notification-center-title">
          Notifications
          {unreadCount > 0 && (
            <span className="notification-center-count">{unreadCount}</span>
          )}
        </span>
        <div className="notification-center-actions">
          <button
            type="button"
            className="notification-center-action"
            onClick={markAllAsRead}
            disabled={unreadCount === 0}
          >
            Mark all read
          </button>
          <button
            type="button"
            className="notification-center-action"
            onClick={clearAll}
            disabled={notifications.length === 0}
          >
            Clear all
          </button>
        </div>
      </div>

      {notifications.length === 0 ? (
        <div className="notification-empty">
          <span className="notification-empty-icon" aria-hidden="true">
            🔔
          </span>
          <p className="notification-empty-text">You&apos;re all caught up</p>
        </div>
      ) : (
        <ul className="notification-list">
          {notifications.map((notification) => (
            <NotificationItem
              key={notification.id}
              notification={notification}
              onClose={onClose}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
