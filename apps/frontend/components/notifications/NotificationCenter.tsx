"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale } from "next-intl";
import type {
  AppNotification,
  NotificationType,
} from "../../hooks/useNotifications";
import { useNotifications } from "../../hooks/useNotifications";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import {
  groupNotifications,
  type NotificationStack,
} from "../../lib/notificationThreading";
import { HoverPrefetchLink } from "../layout/HoverPrefetchLink";
import { formatRelativeTime } from "../../lib/intl";

const TYPE_ICON: Record<NotificationType, string> = {
  info: "ℹ️",
  success: "✅",
  warning: "⚠️",
  error: "⛔",
};

interface NotificationItemProps {
  notification: AppNotification;
  onClose: () => void;
}

function NotificationItem({ notification, onClose }: NotificationItemProps) {
  const { markAsRead, remove } = useNotifications();
  const locale = useLocale();

  function handleActivate() {
    if (typeof markAsRead === "function") markAsRead(notification.id);
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
          {formatRelativeTime(new Date(notification.createdAt), locale)}
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
        // Approval deep-link (#621): hover/focus-intent prefetch, not
        // viewport — the panel can list many items, and only a few are
        // ever opened per visit.
        <HoverPrefetchLink
          href={notification.href}
          className="notification-item-main"
          onClick={handleActivate}
        >
          {body}
        </HoverPrefetchLink>
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
        onClick={() => remove && remove(notification.id)}
      >
        ✕
      </button>
    </li>
  );
}

interface NotificationStackItemProps {
  stack: NotificationStack;
  onClose: () => void;
}

function NotificationStackItem({ stack, onClose }: NotificationStackItemProps) {
  const { markDelegationAsRead } = useNotifications();
  const [expanded, setExpanded] = useState(false);

  const handleMarkStackRead = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (typeof markDelegationAsRead === "function") {
      markDelegationAsRead(stack.delegationId);
    }
  };

  return (
    <li className="notification-stack-container border-b last:border-b-0 border-slate-200 dark:border-slate-800">
      <div
        className={`notification-stack-header flex items-center justify-between p-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-900/50 transition ${
          stack.unreadCount > 0 ? "bg-slate-50/80 dark:bg-slate-900/30" : ""
        }`}
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="text-xs font-bold px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
            aria-label={expanded ? "Collapse stack" : "Expand stack"}
          >
            {expanded ? "▼" : "▶"}
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold text-slate-500">
                Delegation: {stack.delegationId}
              </span>
              {stack.unreadCount > 0 && (
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                  {stack.unreadCount} unread
                </span>
              )}
            </div>
            <p className="text-xs text-slate-700 dark:text-slate-300 font-medium truncate max-w-xs">
              {stack.latest.title}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {stack.unreadCount > 0 && (
            <button
              type="button"
              onClick={handleMarkStackRead}
              className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
            >
              Mark read
            </button>
          )}
          <HoverPrefetchLink
            href={`/delegations/${stack.delegationId}`}
            onClick={onClose}
            className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            View detail
          </HoverPrefetchLink>
        </div>
      </div>

      {expanded && (
        <ul className="notification-stack-children pl-4 bg-slate-100/50 dark:bg-slate-950/40 border-t border-slate-200 dark:border-slate-800">
          {stack.items.map((item) => (
            <NotificationItem
              key={item.id}
              notification={item}
              onClose={onClose}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

export interface NotificationCenterProps {
  /** Close the panel (used after navigating from an item). */
  onClose: () => void;
}

export function NotificationCenter({ onClose }: NotificationCenterProps) {
  const {
    notifications = [],
    unreadCount = 0,
    mutedCount = 0,
    groupingEnabled = true,
    setGroupingEnabled,
    markAllAsRead,
    clearAll,
    undoClearAll,
    dismissUndo,
    canUndoClear,
    pruneNow,
  } = useNotifications();
  const panelRef = useRef<HTMLDivElement>(null);

  useFocusTrap(panelRef, true);

  // Lazy prune on center open (#605) safely
  useEffect(() => {
    if (typeof pruneNow === "function") {
      pruneNow();
    }
  }, [pruneNow]);

  const groupedEntries = groupNotifications(notifications, groupingEnabled);

  return (
    <div
      ref={panelRef}
      className="notification-center"
      role="dialog"
      aria-modal="true"
      aria-label="Notifications"
      tabIndex={-1}
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
          {setGroupingEnabled && (
            <button
              type="button"
              className="notification-center-action"
              onClick={() => setGroupingEnabled(!groupingEnabled)}
              disabled={notifications.length === 0}
              title={
                groupingEnabled ? "Switch to flat list" : "Group by delegation"
              }
            >
              {groupingEnabled ? "Grouped" : "Flat"}
            </button>
          )}
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

      {mutedCount > 0 && (
        <div className="notification-muted-bar bg-amber-500/10 text-amber-700 dark:text-amber-300 text-xs px-3 py-1.5 border-b border-amber-500/20 flex items-center justify-between">
          <span>🌙 {mutedCount} muted while quiet hours active</span>
        </div>
      )}

      {canUndoClear && (
        <div
          className="notification-undo-bar"
          style={{
            padding: "0.5rem 0.875rem",
            background: "var(--color-accent-bg)",
            color: "var(--color-accent)",
            fontSize: "0.8125rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderBottom: "1px solid var(--color-border)",
          }}
        >
          <span>Notifications cleared</span>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button
              type="button"
              onClick={undoClearAll}
              style={{
                fontWeight: 600,
                background: "none",
                border: "none",
                color: "inherit",
                cursor: "pointer",
                textDecoration: "underline",
              }}
            >
              Undo
            </button>
            <button
              type="button"
              onClick={dismissUndo}
              aria-label="Dismiss undo banner"
              style={{
                background: "none",
                border: "none",
                color: "inherit",
                cursor: "pointer",
              }}
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {notifications.length === 0 ? (
        <div className="notification-empty">
          <span className="notification-empty-icon" aria-hidden="true">
            🔔
          </span>
          <p className="notification-empty-text">You&apos;re all caught up</p>
        </div>
      ) : (
        <ul className="notification-list">
          {groupedEntries.map((entry, idx) => {
            if (entry.type === "single") {
              return (
                <NotificationItem
                  key={entry.notification.id}
                  notification={entry.notification}
                  onClose={onClose}
                />
              );
            }
            return (
              <NotificationStackItem
                key={`stack-${entry.stack.delegationId}-${idx}`}
                stack={entry.stack}
                onClose={onClose}
              />
            );
          })}
        </ul>
      )}
    </div>
  );
}
