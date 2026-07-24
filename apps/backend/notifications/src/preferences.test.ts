import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getUserPreferences,
  updateUserPreferences,
  shouldSendNotification,
  getEnabledChannels,
  getDefaultPreferences,
  type UserNotificationPreferences,
  type NotificationEventType,
  type NotificationChannel,
} from "./preferences.js";

const mockRedis = {
  get: vi.fn(),
  set: vi.fn(),
};

describe("Notification Preferences", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getDefaultPreferences", () => {
    it("returns default preferences for all event types", () => {
      const defaults = getDefaultPreferences();
      expect(defaults).toHaveProperty("escrow.released");
      expect(defaults).toHaveProperty("escrow.locked");
      expect(defaults).toHaveProperty("payment.failed");
      expect(defaults).toHaveProperty("permission.granted");
      expect(defaults).toHaveProperty("permission.revoked");
      expect(defaults).toHaveProperty("transaction_approval");
    });

    it("returns a deep copy of defaults", () => {
      const defaults1 = getDefaultPreferences();
      const defaults2 = getDefaultPreferences();
      defaults1["escrow.released"].enabled = false;
      expect(defaults2["escrow.released"].enabled).toBe(true);
    });
  });

  describe("getUserPreferences", () => {
    it("returns default preferences when no stored preferences exist", async () => {
      mockRedis.get.mockResolvedValue(null);
      const prefs = await getUserPreferences(mockRedis as any, "user123");
      expect(prefs.userId).toBe("user123");
      expect(prefs.preferences["escrow.released"].enabled).toBe(true);
      expect(prefs.preferences["escrow.released"].channels).toEqual(["email", "push"]);
    });

    it("returns stored preferences when they exist", async () => {
      const storedPrefs: UserNotificationPreferences = {
        userId: "user123",
        preferences: {
          "escrow.released": { enabled: false, channels: ["email"] },
          "escrow.locked": { enabled: true, channels: ["push"] },
          "payment.failed": { enabled: true, channels: ["email"] },
          "permission.granted": { enabled: true, channels: ["push"] },
          "permission.revoked": { enabled: true, channels: ["push"] },
          "transaction_approval": { enabled: true, channels: ["email", "push"] },
        },
        updatedAt: Date.now(),
      };
      mockRedis.get.mockResolvedValue(JSON.stringify(storedPrefs));
      
      const prefs = await getUserPreferences(mockRedis as any, "user123");
      expect(prefs.preferences["escrow.released"].enabled).toBe(false);
      expect(prefs.preferences["escrow.locked"].channels).toEqual(["push"]);
    });

    it("merges stored preferences with defaults for new event types", async () => {
      const storedPrefs = {
        userId: "user123",
        preferences: {
          "escrow.released": { enabled: false, channels: ["email"] },
        },
        updatedAt: Date.now(),
      };
      mockRedis.get.mockResolvedValue(JSON.stringify(storedPrefs));
      
      const prefs = await getUserPreferences(mockRedis as any, "user123");
      expect(prefs.preferences["escrow.released"].enabled).toBe(false);
      expect(prefs.preferences["escrow.locked"].enabled).toBe(true);
    });

    it("returns defaults when stored preferences are invalid JSON", async () => {
      mockRedis.get.mockResolvedValue("invalid-json");
      const prefs = await getUserPreferences(mockRedis as any, "user123");
      expect(prefs.preferences["escrow.released"].enabled).toBe(true);
    });
  });

  describe("updateUserPreferences", () => {
    it("updates preferences and stores in Redis", async () => {
      mockRedis.get.mockResolvedValue(null);
      mockRedis.set.mockResolvedValue("OK");
      
      const updates = {
        "escrow.released": { enabled: false },
      };
      
      const prefs = await updateUserPreferences(mockRedis as any, "user123", updates);
      expect(prefs.preferences["escrow.released"].enabled).toBe(false);
      expect(mockRedis.set).toHaveBeenCalled();
    });

    it("merges updates with existing preferences", async () => {
      const existingPrefs: UserNotificationPreferences = {
        userId: "user123",
        preferences: {
          "escrow.released": { enabled: true, channels: ["push"] },
          "escrow.locked": { enabled: true, channels: ["email", "push"] },
          "payment.failed": { enabled: true, channels: ["email"] },
          "permission.granted": { enabled: true, channels: ["push"] },
          "permission.revoked": { enabled: true, channels: ["push"] },
          "transaction_approval": { enabled: true, channels: ["email", "push"] },
        },
        updatedAt: Date.now(),
      };
      mockRedis.get.mockResolvedValue(JSON.stringify(existingPrefs));
      mockRedis.set.mockResolvedValue("OK");
      
      const updates = {
        "escrow.released": { channels: ["email"] as NotificationChannel[] },
      };
      
      const prefs = await updateUserPreferences(mockRedis as any, "user123", updates);
      expect(prefs.preferences["escrow.released"].channels).toEqual(["email"]);
      expect(prefs.preferences["escrow.released"].enabled).toBe(true);
    });
  });

  describe("shouldSendNotification", () => {
    it("returns true when notification is enabled for channel", () => {
      const prefs: UserNotificationPreferences = {
        userId: "user123",
        preferences: {
          "escrow.released": { enabled: true, channels: ["email", "push"] },
          "escrow.locked": { enabled: true, channels: ["email", "push"] },
          "payment.failed": { enabled: true, channels: ["email"] },
          "permission.granted": { enabled: true, channels: ["push"] },
          "permission.revoked": { enabled: true, channels: ["push"] },
          "transaction_approval": { enabled: true, channels: ["email", "push"] },
        },
        updatedAt: Date.now(),
      };
      
      expect(shouldSendNotification(prefs, "escrow.released", "email")).toBe(true);
      expect(shouldSendNotification(prefs, "escrow.released", "push")).toBe(true);
      expect(shouldSendNotification(prefs, "payment.failed", "email")).toBe(true);
      expect(shouldSendNotification(prefs, "payment.failed", "push")).toBe(false);
    });

    it("returns false when notification is disabled", () => {
      const prefs: UserNotificationPreferences = {
        userId: "user123",
        preferences: {
          "escrow.released": { enabled: false, channels: ["email", "push"] },
          "escrow.locked": { enabled: true, channels: ["email", "push"] },
          "payment.failed": { enabled: true, channels: ["email"] },
          "permission.granted": { enabled: true, channels: ["push"] },
          "permission.revoked": { enabled: true, channels: ["push"] },
          "transaction_approval": { enabled: true, channels: ["email", "push"] },
        },
        updatedAt: Date.now(),
      };
      
      expect(shouldSendNotification(prefs, "escrow.released", "email")).toBe(false);
      expect(shouldSendNotification(prefs, "escrow.released", "push")).toBe(false);
    });
  });

  describe("getEnabledChannels", () => {
    it("returns enabled channels for event type", () => {
      const prefs: UserNotificationPreferences = {
        userId: "user123",
        preferences: {
          "escrow.released": { enabled: true, channels: ["email"] },
          "escrow.locked": { enabled: true, channels: ["email", "push"] },
          "payment.failed": { enabled: true, channels: ["email"] },
          "permission.granted": { enabled: true, channels: ["push"] },
          "permission.revoked": { enabled: true, channels: ["push"] },
          "transaction_approval": { enabled: true, channels: ["email", "push"] },
        },
        updatedAt: Date.now(),
      };
      
      expect(getEnabledChannels(prefs, "escrow.released")).toEqual(["email"]);
      expect(getEnabledChannels(prefs, "escrow.locked")).toEqual(["email", "push"]);
    });

    it("returns empty array when notification is disabled", () => {
      const prefs: UserNotificationPreferences = {
        userId: "user123",
        preferences: {
          "escrow.released": { enabled: false, channels: ["email", "push"] },
          "escrow.locked": { enabled: true, channels: ["email", "push"] },
          "payment.failed": { enabled: true, channels: ["email"] },
          "permission.granted": { enabled: true, channels: ["push"] },
          "permission.revoked": { enabled: true, channels: ["push"] },
          "transaction_approval": { enabled: true, channels: ["email", "push"] },
        },
        updatedAt: Date.now(),
      };
      
      expect(getEnabledChannels(prefs, "escrow.released")).toEqual([]);
    });
  });
});