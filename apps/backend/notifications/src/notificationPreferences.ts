import { NotificationPreferences } from "./models/NotificationPreferences.js";

export interface ChannelPreferences {
  emailEnabled: boolean;
  pushEnabled: boolean;
}

export async function getUserPreferences(userId: string): Promise<ChannelPreferences> {
  const preferences = await NotificationPreferences.findByPk(userId);
  if (preferences) {
    return {
      emailEnabled: preferences.emailEnabled,
      pushEnabled: preferences.pushEnabled,
    };
  }
  // Default to both enabled if no preferences found
  return {
    emailEnabled: true,
    pushEnabled: true,
  };
}

export async function upsertUserPreferences(
  userId: string,
  preferences: Partial<ChannelPreferences>
): Promise<ChannelPreferences> {
  const [record] = await NotificationPreferences.upsert(
    {
      userId,
      emailEnabled: preferences.emailEnabled ?? true,
      pushEnabled: preferences.pushEnabled ?? true,
    },
    { returning: true }
  );
  return {
    emailEnabled: record.emailEnabled,
    pushEnabled: record.pushEnabled,
  };
}
