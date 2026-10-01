import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_CHIME_VOLUME, MIN_CHIME_VOLUME } from "./audioChime";
import {
  AUDIO_NOTIFICATION_STORAGE_KEY,
  DEFAULT_AUDIO_NOTIFICATION_PREFERENCES,
  isAudioNotificationPreferences,
  MAX_AUDIO_NOTIFICATION_VOLUME,
  MIN_AUDIO_NOTIFICATION_VOLUME,
  normalizeAudioNotificationVolume,
  readAudioNotificationPreferences,
  writeAudioNotificationPreferences,
  type AudioNotificationOptions,
} from "./audioNotification";

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  window.localStorage.clear();
});

describe("audioNotification — AudioNotificationOptions contract", () => {
  it("exposes soundEnabled, volume and a callable playChime", () => {
    const options: AudioNotificationOptions = {
      soundEnabled: true,
      volume: 0.3,
      playChime: () => {},
    };

    expect(typeof options.playChime).toBe("function");
    expect(options.soundEnabled).toBe(true);
    expect(options.volume).toBe(0.3);
  });

  it("defaults to silent at a low volume", () => {
    expect(DEFAULT_AUDIO_NOTIFICATION_PREFERENCES).toEqual({
      soundEnabled: false,
      volume: DEFAULT_CHIME_VOLUME,
    });
    expect(DEFAULT_AUDIO_NOTIFICATION_PREFERENCES.volume).toBeLessThan(0.5);
  });
});

describe("audioNotification — normalizeAudioNotificationVolume", () => {
  it("passes in-range volumes through", () => {
    expect(normalizeAudioNotificationVolume(0.2)).toBe(0.2);
    expect(
      normalizeAudioNotificationVolume(MAX_AUDIO_NOTIFICATION_VOLUME)
    ).toBe(1);
  });

  it("clamps above the maximum", () => {
    expect(normalizeAudioNotificationVolume(9)).toBe(1);
  });

  it("snaps near-zero and negative values up to the minimum, never to silence", () => {
    expect(normalizeAudioNotificationVolume(0)).toBe(
      MIN_AUDIO_NOTIFICATION_VOLUME
    );
    expect(normalizeAudioNotificationVolume(-5)).toBe(
      MIN_AUDIO_NOTIFICATION_VOLUME
    );
    expect(MIN_AUDIO_NOTIFICATION_VOLUME).toBe(MIN_CHIME_VOLUME);
  });

  it("falls back to the default for non-finite input", () => {
    expect(normalizeAudioNotificationVolume(Number.NaN)).toBe(
      DEFAULT_AUDIO_NOTIFICATION_PREFERENCES.volume
    );
  });
});

describe("audioNotification — isAudioNotificationPreferences", () => {
  it("accepts a well-formed value", () => {
    expect(
      isAudioNotificationPreferences({ soundEnabled: true, volume: 0.4 })
    ).toBe(true);
  });

  it("rejects non-objects and null", () => {
    expect(isAudioNotificationPreferences(null)).toBe(false);
    expect(isAudioNotificationPreferences("on")).toBe(false);
    expect(isAudioNotificationPreferences(undefined)).toBe(false);
  });

  it("rejects a partial or wrongly-typed value", () => {
    expect(isAudioNotificationPreferences({ soundEnabled: true })).toBe(false);
    expect(isAudioNotificationPreferences({ volume: 0.4 })).toBe(false);
    expect(
      isAudioNotificationPreferences({ soundEnabled: "yes", volume: 0.4 })
    ).toBe(false);
    expect(
      isAudioNotificationPreferences({ soundEnabled: true, volume: "0.4" })
    ).toBe(false);
  });
});

describe("audioNotification — readAudioNotificationPreferences", () => {
  it("returns the defaults when nothing is stored", () => {
    expect(readAudioNotificationPreferences()).toEqual(
      DEFAULT_AUDIO_NOTIFICATION_PREFERENCES
    );
  });

  it("returns the stored value", () => {
    writeAudioNotificationPreferences({ soundEnabled: true, volume: 0.25 });

    expect(readAudioNotificationPreferences()).toEqual({
      soundEnabled: true,
      volume: 0.25,
    });
  });

  it("normalizes an out-of-range stored volume", () => {
    window.localStorage.setItem(
      AUDIO_NOTIFICATION_STORAGE_KEY,
      JSON.stringify({ soundEnabled: true, volume: 12 })
    );

    expect(readAudioNotificationPreferences().volume).toBe(1);
  });

  it("falls back to the defaults on malformed JSON", () => {
    window.localStorage.setItem(AUDIO_NOTIFICATION_STORAGE_KEY, "{not json");

    expect(readAudioNotificationPreferences()).toEqual(
      DEFAULT_AUDIO_NOTIFICATION_PREFERENCES
    );
  });

  it("falls back to the defaults on a wrongly-shaped value", () => {
    window.localStorage.setItem(
      AUDIO_NOTIFICATION_STORAGE_KEY,
      JSON.stringify({ soundEnabled: "true" })
    );

    expect(readAudioNotificationPreferences()).toEqual(
      DEFAULT_AUDIO_NOTIFICATION_PREFERENCES
    );
  });

  it("falls back to the defaults when localStorage throws", () => {
    const spy = vi
      .spyOn(window.localStorage, "getItem")
      .mockImplementation(() => {
        throw new Error("blocked");
      });

    expect(readAudioNotificationPreferences()).toEqual(
      DEFAULT_AUDIO_NOTIFICATION_PREFERENCES
    );

    spy.mockRestore();
  });
});

describe("audioNotification — writeAudioNotificationPreferences", () => {
  it("persists under the documented key", () => {
    writeAudioNotificationPreferences({ soundEnabled: true, volume: 0.5 });

    expect(
      JSON.parse(
        window.localStorage.getItem(AUDIO_NOTIFICATION_STORAGE_KEY) ?? "{}"
      )
    ).toEqual({ soundEnabled: true, volume: 0.5 });
  });

  it("swallows persistence failures", () => {
    const spy = vi
      .spyOn(window.localStorage, "setItem")
      .mockImplementation(() => {
        throw new Error("quota exceeded");
      });

    expect(() =>
      writeAudioNotificationPreferences({ soundEnabled: true, volume: 0.5 })
    ).not.toThrow();

    spy.mockRestore();
  });

  it("round-trips through the reader", () => {
    const preferences = {
      soundEnabled: true,
      volume: MIN_AUDIO_NOTIFICATION_VOLUME,
    };
    writeAudioNotificationPreferences(preferences);

    expect(readAudioNotificationPreferences()).toEqual(preferences);
  });
});
