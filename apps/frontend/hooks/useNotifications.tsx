"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";
import { useAnnounce } from "./useAnnounce";
import {
  DEFAULT_QUIET_HOURS,
  loadQuietHoursConfig,
  saveQuietHoursConfig,
  shouldMuteForQuietHours,
  type QuietHoursConfig,
} from "../lib/quietHours";

export type NotificationType = "info" | "success" | "warning" | "error";

export type NotificationRetention = "7" | "30" | "90" | "all";

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  /** Optional longer body */
  message?: string;
  /** Epoch millis the notification was created */
  createdAt: number;
  read: boolean;
  /** Optional in-app link to navigate to when clicked */
  href?: string;
  /** Optional delegation ID for threading (#604) */
  delegationId?: string;
  /** Severity level for Quiet Hours filtering (#602) */
  severity?: "routine" | "approval";
  /** Whether item was muted during quiet hours (#602) */
  mutedDuringQuietHours?: boolean;
}

/** Shape accepted when pushing a new notification (id/time/read are filled in). */
export type NewNotification = Omit<
  AppNotification,
  "id" | "createdAt" | "read"
> & {
  id?: string;
  createdAt?: number;
};

export interface NotificationContextValue {
  notifications: AppNotification[];
  unreadCount: number;
  retention: NotificationRetention;
  setRetention: (retention: NotificationRetention) => void;
  groupingEnabled: boolean;
  setGroupingEnabled: (enabled: boolean) => void;
  quietHours: QuietHoursConfig;
  setQuietHours: (config: QuietHoursConfig) => void;
  mutedCount: number;
  add: (notification: NewNotification) => string;
  markAsRead: (id: string) => void;
  markDelegationAsRead: (delegationId: string) => void;
  markAllAsRead: () => void;
  remove: (id: string) => void;
  clearAll: () => void;
  undoClearAll: () => void;
  dismissUndo: () => void;
  canUndoClear: boolean;
  pruneNow: () => void;
}

const NotificationContext = createContext<NotificationContextValue | null>(
  null
);

const STORAGE_KEY = "delego_notifications";
const RETENTION_STORAGE_KEY = "delego_notification_retention";
const GROUPING_STORAGE_KEY = "delego_notification_grouping";
export const MAX_NOTIFICATIONS = 500;

const DAY_MS = 24 * 60 * 60 * 1000;

export const RETENTION_MS_MAP: Record<
  Exclude<NotificationRetention, "all">,
  number
> = {
  "7": 7 * DAY_MS,
  "30": 30 * DAY_MS,
  "90": 90 * DAY_MS,
};

export function pruneNotifications(
  items: AppNotification[],
  retention: NotificationRetention,
  now: number = Date.now()
): AppNotification[] {
  if (!Array.isArray(items)) return [];

  const pruned = items.filter((n) => {
    if (!n || typeof n.createdAt !== "number") return false;
    if (!n.read) return true;
    if (retention === "all") return true;

    const retentionMs = RETENTION_MS_MAP[retention];
    if (typeof retentionMs !== "number") return true;

    const ageMs = now - n.createdAt;
    return ageMs <= retentionMs;
  });

  return pruned.slice(0, MAX_NOTIFICATIONS);
}

function generateId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return `n_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function loadStored(): AppNotification[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (n): n is AppNotification =>
        n &&
        typeof n.id === "string" &&
        typeof n.title === "string" &&
        typeof n.createdAt === "number"
    );
  } catch {
    return [];
  }
}

function loadStoredRetention(): NotificationRetention {
  try {
    const raw = window.localStorage.getItem(RETENTION_STORAGE_KEY);
    if (raw === "7" || raw === "30" || raw === "90" || raw === "all") {
      return raw;
    }
  } catch {
    /* ignore */
  }
  return "30";
}

function loadStoredGrouping(): boolean {
  try {
    const raw = window.localStorage.getItem(GROUPING_STORAGE_KEY);
    if (raw !== null) return raw === "true";
  } catch {
    /* ignore */
  }
  return true;
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [retention, setRetentionState] = useState<NotificationRetention>("30");
  const [groupingEnabled, setGroupingEnabledState] = useState<boolean>(true);
  const [quietHours, setQuietHoursState] =
    useState<QuietHoursConfig>(DEFAULT_QUIET_HOURS);
  const [clearedBackup, setClearedBackup] = useState<AppNotification[] | null>(
    null
  );

  // Try to useAnnounce safely if provider present
  let rawAnnounce: ((msg: string, politeness?: "polite" | "assertive") => void) | undefined;
  try {
    const announceCtx = useAnnounce();
    if (announceCtx?.announce) {
      rawAnnounce = announceCtx.announce;
    }
  } catch {
    // AnnounceProvider not present in some isolated tests
  }

  const announceFn = useCallback((msg: string, politeness?: "polite" | "assertive") => {
    if (rawAnnounce) rawAnnounce(msg, politeness);
  }, [rawAnnounce]);

  // Initial load
  useEffect(() => {
    const initialRetention = loadStoredRetention();
    setRetentionState(initialRetention);
    setGroupingEnabledState(loadStoredGrouping());
    setQuietHoursState(loadQuietHoursConfig());
    const loaded = loadStored();
    const pruned = pruneNotifications(loaded, initialRetention);
    setNotifications(pruned);
  }, []);

  // Persist notifications on change
  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(notifications));
    } catch {
      /* ignore */
    }
  }, [notifications]);

  const setRetention = useCallback((nextRetention: NotificationRetention) => {
    setRetentionState(nextRetention);
    try {
      window.localStorage.setItem(RETENTION_STORAGE_KEY, nextRetention);
    } catch {
      /* ignore */
    }
    setNotifications((prev) => pruneNotifications(prev, nextRetention));
  }, []);

  const setGroupingEnabled = useCallback((enabled: boolean) => {
    setGroupingEnabledState(enabled);
    try {
      window.localStorage.setItem(GROUPING_STORAGE_KEY, String(enabled));
    } catch {
      /* ignore */
    }
  }, []);

  const setQuietHours = useCallback((config: QuietHoursConfig) => {
    setQuietHoursState(config);
    saveQuietHoursConfig(config);
  }, []);

  // Cross-tab sync
  useEffect(() => {
    function onStorage(event: StorageEvent) {
      if (event.key === STORAGE_KEY) {
        setNotifications(pruneNotifications(loadStored(), retention));
      } else if (event.key === RETENTION_STORAGE_KEY) {
        const updatedRetention = loadStoredRetention();
        setRetentionState(updatedRetention);
        setNotifications((prev) => pruneNotifications(prev, updatedRetention));
      } else if (event.key === GROUPING_STORAGE_KEY) {
        setGroupingEnabledState(loadStoredGrouping());
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [retention]);

  const pruneNow = useCallback(() => {
    setNotifications((prev) => pruneNotifications(prev, retention));
  }, [retention]);

  const add = useCallback(
    (notification: NewNotification) => {
      const id = notification.id ?? generateId();
      const isMuted = shouldMuteForQuietHours(notification, quietHours);

      const entry: AppNotification = {
        type: notification.type,
        title: notification.title,
        message: notification.message,
        href: notification.href,
        delegationId: notification.delegationId,
        severity:
          notification.severity ||
          (notification.type === "error" ? "approval" : "routine"),
        mutedDuringQuietHours: isMuted,
        id,
        createdAt: notification.createdAt ?? Date.now(),
        read: false,
      };

      setNotifications((prev) =>
        pruneNotifications(
          [entry, ...prev.filter((n) => n.id !== id)],
          retention
        )
      );

      if (!isMuted) {
        announceFn(
          entry.title,
          entry.type === "error" ? "assertive" : "polite"
        );
      }

      return id;
    },
    [announceFn, quietHours, retention]
  );

  const markAsRead = useCallback((id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
  }, []);

  const markDelegationAsRead = useCallback((delegationId: string) => {
    setNotifications((prev) =>
      prev.map((n) =>
        n.delegationId === delegationId ? { ...n, read: true } : n
      )
    );
  }, []);

  const markAllAsRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  const remove = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    setNotifications((prev) => {
      setClearedBackup(prev);
      return [];
    });
    announceFn("All notifications cleared.", "polite");
  }, [announceFn]);

  const undoClearAll = useCallback(() => {
    if (clearedBackup) {
      setNotifications(clearedBackup);
      setClearedBackup(null);
      announceFn("Notifications restored.", "polite");
    }
  }, [clearedBackup, announceFn]);

  const dismissUndo = useCallback(() => {
    setClearedBackup(null);
  }, []);

  const value = useMemo<NotificationContextValue>(() => {
    const unreadCount = notifications.reduce(
      (count, n) => (n.read ? count : count + 1),
      0
    );
    const mutedCount = notifications.reduce(
      (count, n) => (n.mutedDuringQuietHours && !n.read ? count + 1 : count),
      0
    );
    return {
      notifications,
      unreadCount,
      mutedCount,
      retention,
      setRetention,
      groupingEnabled,
      setGroupingEnabled,
      quietHours,
      setQuietHours,
      add,
      markAsRead,
      markDelegationAsRead,
      markAllAsRead,
      remove,
      clearAll,
      undoClearAll,
      dismissUndo,
      canUndoClear: clearedBackup !== null && clearedBackup.length > 0,
      pruneNow,
    };
  }, [
    notifications,
    retention,
    setRetention,
    groupingEnabled,
    setGroupingEnabled,
    quietHours,
    setQuietHours,
    add,
    markAsRead,
    markDelegationAsRead,
    markAllAsRead,
    remove,
    clearAll,
    undoClearAll,
    dismissUndo,
    clearedBackup,
    pruneNow,
  ]);

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications(): NotificationContextValue {
  const ctx = useContext(NotificationContext);
  if (!ctx) {
    throw new Error(
      "useNotifications must be used within a NotificationProvider"
    );
  }
  return ctx;
}
