import { Redis } from "ioredis";
import { createLogger } from "@delego/utils";

const log = createLogger(
  "notifications:preferences",
  process.env.LOG_LEVEL ?? "info"
);

const PREFERENCES_NS = "notification:preferences";

export type NotificationChannel = "email" | "push";

export type NotificationEventType =
  | "escrow.released"
  | "escrow.locked"
  | "payment.failed"
  | "permission.granted"
  | "permission.revoked"
  | "transaction_approval";

export interface NotificationPreference {
  enabled: boolean;
  channels: NotificationChannel[];
}

export interface UserNotificationPreferences {
  userId: string;
  preferences: Record<NotificationEventType, NotificationPreference>;
  updatedAt: number;
}

const DEFAULT_PREFERENCES: Record<NotificationEventType, NotificationPreference> = {
  "escrow.released": { enabled: true, channels: ["email", "push"] },
  "escrow.locked": { enabled: true, channels: ["email", "push"] },
  "payment.failed": { enabled: true, channels: ["email"] },
  "permission.granted": { enabled: true, channels: ["push"] },
  "permission.revoked": { enabled: true, channels: ["push"] },
  "transaction_approval": { enabled: true, channels: ["email", "push"] },
};

export function getDefaultPreferences(): Record<NotificationEventType, NotificationPreference> {
  return JSON.parse(JSON.stringify(DEFAULT_PREFERENCES));
}

export async function getUserPreferences(
  redis: Redis,
  userId: string
): Promise<UserNotificationPreferences> {
  const key = `${PREFERENCES_NS}:${userId}`;
  const data = await redis.get(key);
  
  if (!data) {
    return {
      userId,
      preferences: getDefaultPreferences(),
      updatedAt: Date.now(),
    };
  }

  try {
    const parsed = JSON.parse(data) as UserNotificationPreferences;
    // Merge with defaults to ensure any new event types are included
    const mergedPreferences = {
      ...getDefaultPreferences(),
      ...parsed.preferences,
    };
    return {
      ...parsed,
      preferences: mergedPreferences,
    };
  } catch (err) {
    log.error("Failed to parse user preferences, returning defaults", {
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
    return {
      userId,
      preferences: getDefaultPreferences(),
      updatedAt: Date.now(),
    };
  }
}

export async function updateUserPreferences(
  redis: Redis,
  userId: string,
  updates: Partial<Record<NotificationEventType, Partial<NotificationPreference>>>
): Promise<UserNotificationPreferences> {
  const current = await getUserPreferences(redis, userId);
  
  const updatedPreferences = { ...current.preferences };
  for (const [eventType, update] of Object.entries(updates)) {
    if (eventType in updatedPreferences) {
      updatedPreferences[eventType as NotificationEventType] = {
        ...updatedPreferences[eventType as NotificationEventType],
        ...update,
      };
    }
  }

  const updated: UserNotificationPreferences = {
    userId,
    preferences: updatedPreferences,
    updatedAt: Date.now(),
  };

  const key = `${PREFERENCES_NS}:${userId}`;
  await redis.set(key, JSON.stringify(updated), "EX", 365 * 24 * 60 * 60); // 1 year TTL

  log.info("Updated user notification preferences", { userId });
  return updated;
}

export function shouldSendNotification(
  preferences: UserNotificationPreferences,
  eventType: NotificationEventType,
  channel: NotificationChannel
): boolean {
  const pref = preferences.preferences[eventType];
  if (!pref || !pref.enabled) {
    return false;
  }
  return pref.channels.includes(channel);
}

export function getEnabledChannels(
  preferences: UserNotificationPreferences,
  eventType: NotificationEventType
): NotificationChannel[] {
  const pref = preferences.preferences[eventType];
  if (!pref || !pref.enabled) {
    return [];
  }
  return pref.channels;
}