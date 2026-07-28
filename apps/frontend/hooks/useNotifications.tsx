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

export type NotificationType = "info" | "success" | "warning" | "error";

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
}

/** Shape accepted when pushing a new notification (id/time/read are filled in). */
export type NewNotification = Omit<
  AppNotification,
  "id" | "createdAt" | "read"
> & {
  id?: string;
  createdAt?: number;
};

interface NotificationContextValue {
  notifications: AppNotification[];
  unreadCount: number;
  add: (notification: NewNotification) => string;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  remove: (id: string) => void;
  clearAll: () => void;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

const STORAGE_KEY = "delego_notifications";
const MAX_NOTIFICATIONS = 50;

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

/**
 * In-app notification store backed by localStorage.
 *
 * Notifications are read on mount (client only) and persisted on every change,
 * capped at MAX_NOTIFICATIONS most-recent entries. Other tabs stay in sync via
 * the `storage` event.
 */
export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  useEffect(() => {
    setNotifications(loadStored());
  }, []);

  // Persist on change.
  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(notifications));
    } catch {
      // Ignore quota / availability errors.
    }
  }, [notifications]);

  // Cross-tab sync.
  useEffect(() => {
    function onStorage(event: StorageEvent) {
      if (event.key === STORAGE_KEY) {
        setNotifications(loadStored());
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const add = useCallback((notification: NewNotification) => {
    const id = notification.id ?? generateId();
    const entry: AppNotification = {
      type: notification.type,
      title: notification.title,
      message: notification.message,
      href: notification.href,
      id,
      createdAt: notification.createdAt ?? Date.now(),
      read: false,
    };
    setNotifications((prev) =>
      [entry, ...prev.filter((n) => n.id !== id)].slice(0, MAX_NOTIFICATIONS)
    );
    return id;
  }, []);

  const markAsRead = useCallback((id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
  }, []);

  const markAllAsRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  const remove = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    setNotifications([]);
  }, []);

  const value = useMemo<NotificationContextValue>(() => {
    const unreadCount = notifications.reduce(
      (count, n) => (n.read ? count : count + 1),
      0
    );
    return {
      notifications,
      unreadCount,
      add,
      markAsRead,
      markAllAsRead,
      remove,
      clearAll,
    };
  }, [notifications, add, markAsRead, markAllAsRead, remove, clearAll]);

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}

/** Access the notification store. Must be used within a NotificationProvider. */
export function useNotifications(): NotificationContextValue {
  const ctx = useContext(NotificationContext);
  if (!ctx) {
    throw new Error(
      "useNotifications must be used within a NotificationProvider"
    );
  }
  return ctx;
}
