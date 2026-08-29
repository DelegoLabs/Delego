import { describe, it, expect, beforeEach } from "vitest";
import {
  DEFAULT_CONSENT_PREFERENCES,
  getConsentPreferences,
  hasConsentChoice,
  getConsentLog,
  setConsentPreferences,
  acceptAllConsent,
  acceptEssentialOnlyConsent,
  resetConsentForTesting,
} from "./consent";

describe("lib/consent (#612)", () => {
  beforeEach(() => {
    resetConsentForTesting();
  });

  it("has no stored choice before any consent action", () => {
    expect(hasConsentChoice()).toBe(false);
    expect(getConsentPreferences()).toBeNull();
  });

  it("defaults to essential-only when no choice has been made", () => {
    expect(DEFAULT_CONSENT_PREFERENCES).toEqual({
      essential: true,
      productAnalytics: false,
      marketing: false,
    });
  });

  it("acceptAllConsent grants both categories and records a choice", () => {
    const result = acceptAllConsent();
    expect(result).toEqual({ essential: true, productAnalytics: true, marketing: true });
    expect(hasConsentChoice()).toBe(true);
    expect(getConsentPreferences()).toEqual(result);
  });

  it("acceptEssentialOnlyConsent records a choice without granting either category", () => {
    const result = acceptEssentialOnlyConsent();
    expect(result).toEqual({ essential: true, productAnalytics: false, marketing: false });
    expect(hasConsentChoice()).toBe(true);
  });

  it("setConsentPreferences updates individual categories independently", () => {
    setConsentPreferences({ productAnalytics: true, marketing: false }, "settings");
    const updated = setConsentPreferences(
      { productAnalytics: true, marketing: true },
      "settings"
    );
    expect(updated).toEqual({ essential: true, productAnalytics: true, marketing: true });
  });

  it("essential is always true, never settable to false", () => {
    const result = setConsentPreferences(
      { productAnalytics: false, marketing: false },
      "settings"
    );
    expect(result.essential).toBe(true);
  });

  describe("consent log", () => {
    it("starts empty", () => {
      expect(getConsentLog()).toEqual([]);
    });

    it("logs one entry per category that actually changed", () => {
      acceptAllConsent();
      const log = getConsentLog();
      expect(log).toHaveLength(2);
      expect(log.map((e) => e.category).sort()).toEqual(["marketing", "productAnalytics"]);
      expect(log.every((e) => e.granted)).toBe(true);
      expect(log.every((e) => e.source === "first-run-accept-all")).toBe(true);
    });

    it("does not log anything when re-saving unchanged preferences", () => {
      setConsentPreferences({ productAnalytics: true, marketing: false }, "settings");
      const lengthAfterFirst = getConsentLog().length;
      setConsentPreferences({ productAnalytics: true, marketing: false }, "settings");
      expect(getConsentLog()).toHaveLength(lengthAfterFirst);
    });

    it("logs a revoke with granted: false when a category is turned off", () => {
      setConsentPreferences({ productAnalytics: true, marketing: false }, "settings");
      setConsentPreferences({ productAnalytics: false, marketing: false }, "settings");

      const log = getConsentLog();
      const revoke = log.find((e) => e.category === "productAnalytics" && !e.granted);
      expect(revoke).toBeDefined();
    });

    it("every log entry has a timestamp", () => {
      acceptAllConsent();
      for (const entry of getConsentLog()) {
        expect(entry.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      }
    });

    it("records the source of each change (first-run vs settings)", () => {
      acceptEssentialOnlyConsent();
      setConsentPreferences({ productAnalytics: true, marketing: false }, "settings");

      const log = getConsentLog();
      const settingsEntry = log.find((e) => e.category === "productAnalytics");
      expect(settingsEntry?.source).toBe("settings");
    });
  });
});
