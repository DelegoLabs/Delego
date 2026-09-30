/**
 * Live-chat audio notification preferences (#811).
 *
 * Owns the persisted shape of the "play a chime when an agent message
 * arrives" setting. Mirrors lib/timeFormat.ts: the type guard + defaults live
 * here in `lib/`, while the React glue (hydration, cross-tab sync, and the
 * gated `playChime`) lives in hooks/useAudioNotifications.tsx.
 *
 * `AudioNotificationOptions` is the contract named in the issue's
 * "Data Types & Schemas" section. `playChime` is a *command* rather than a
 * stored value: callers receive one already bound to their own preferences
 * and any audio/accessibility gate, so a consumer can never accidentally
 * bypass the user's mute choice.
 */

import { DEFAULT_CHIME_VOLUME, MIN_CHIME_VOLUME } from "./audioChime";

/**
 * The audio-notification contract from #811.
 *
 * - `soundEnabled` — the user's explicit opt-in, independent of the browser's
 *   autoplay policy and of system reduced-motion settings.
 * - `volume` — linear 0–1 gain for the synthesised chime.
 * - `playChime()` — plays the chime once, honouring every gate.
 */
export interface AudioNotificationOptions {
  soundEnabled: boolean;
  volume: number;
  playChime(): void;
}

/**
 * The persisted subset of {@link AudioNotificationOptions}.
 *
 * `playChime` is intentionally absent: it is a live capability, not
 * something that survives a reload.
 */
export type AudioNotificationPreferences = Omit<
  AudioNotificationOptions,
  "playChime"
>;

/**
 * Defaults: **off**, at a low volume.
 *
 * Silent-by-default mirrors hooks/useOsNotifications.ts: unsolicited audio is
 * a surprising thing to opt someone into, and the chime fires on *every*
 * incoming agent message. A visitor turns it on deliberately, and the settings
 * toggle is where that happens.
 */
export const DEFAULT_AUDIO_NOTIFICATION_PREFERENCES: AudioNotificationPreferences =
  {
    soundEnabled: false,
    volume: DEFAULT_CHIME_VOLUME,
  };

/** localStorage key holding the user's chat-sound selection. */
export const AUDIO_NOTIFICATION_STORAGE_KEY = "delego_chat_audio_notifications";

/** Bounds for the volume slider in the settings UI. */
export const MIN_AUDIO_NOTIFICATION_VOLUME = MIN_CHIME_VOLUME;
export const MAX_AUDIO_NOTIFICATION_VOLUME = 1;

/**
 * Coerces a raw slider/inbound value into the playable range.
 *
 * Values below {@link MIN_AUDIO_NOTIFICATION_VOLUME} snap up to it rather
 * than to silence, so dragging the slider to its stop means "quiet", not
 * "muted" — muting is the toggle's job, and an exponential gain ramp cannot
 * target zero.
 */
export function normalizeAudioNotificationVolume(volume: number): number {
  if (!Number.isFinite(volume)) {
    return DEFAULT_AUDIO_NOTIFICATION_PREFERENCES.volume;
  }
  if (volume < MIN_AUDIO_NOTIFICATION_VOLUME) {
    return MIN_AUDIO_NOTIFICATION_VOLUME;
  }
  return Math.min(MAX_AUDIO_NOTIFICATION_VOLUME, volume);
}

/** Type guard + shape check for a value read back from localStorage. */
export function isAudioNotificationPreferences(
  value: unknown
): value is AudioNotificationPreferences {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.soundEnabled === "boolean" && typeof v.volume === "number";
}

/**
 * Reads the persisted preferences, falling back to
 * {@link DEFAULT_AUDIO_NOTIFICATION_PREFERENCES} for anything missing or
 * malformed (localStorage unavailable, hand-edited value, older shape).
 */
export function readAudioNotificationPreferences(): AudioNotificationPreferences {
  if (typeof window === "undefined") {
    return DEFAULT_AUDIO_NOTIFICATION_PREFERENCES;
  }
  try {
    const raw = window.localStorage.getItem(AUDIO_NOTIFICATION_STORAGE_KEY);
    if (!raw) return DEFAULT_AUDIO_NOTIFICATION_PREFERENCES;
    const parsed: unknown = JSON.parse(raw);
    if (!isAudioNotificationPreferences(parsed)) {
      return DEFAULT_AUDIO_NOTIFICATION_PREFERENCES;
    }
    return {
      soundEnabled: parsed.soundEnabled,
      volume: normalizeAudioNotificationVolume(parsed.volume),
    };
  } catch {
    return DEFAULT_AUDIO_NOTIFICATION_PREFERENCES;
  }
}

/** Writes the preferences, ignoring quota/availability failures. */
export function writeAudioNotificationPreferences(
  preferences: AudioNotificationPreferences
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      AUDIO_NOTIFICATION_STORAGE_KEY,
      JSON.stringify(preferences)
    );
  } catch {
    // Ignore persistence failures — the in-memory value still applies.
  }
}
