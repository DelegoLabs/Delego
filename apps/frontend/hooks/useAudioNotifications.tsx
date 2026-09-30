"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";

import {
  isChimeSupported,
  playChime as playSynthesizedChime,
  prefersReducedSound,
} from "../lib/audioChime";
import {
  AUDIO_NOTIFICATION_STORAGE_KEY,
  DEFAULT_AUDIO_NOTIFICATION_PREFERENCES,
  isAudioNotificationPreferences,
  normalizeAudioNotificationVolume,
  readAudioNotificationPreferences,
  writeAudioNotificationPreferences,
  type AudioNotificationOptions,
  type AudioNotificationPreferences,
} from "../lib/audioNotification";

export interface AudioNotificationsContextValue {
  /** The user's explicit opt-in, as persisted. */
  soundEnabled: boolean;
  /** Linear 0–1 gain for the synthesised chime. */
  volume: number;
  /** True once the persisted value has been read on the client. */
  hydrated: boolean;
  /** Whether a chime would actually be audible right now (support + accessibility + opt-in). */
  active: boolean;
  /** Why the chime is currently suppressed, for settings copy. */
  suppressionReason: AudioSuppressionReason | null;
  /** The full `AudioNotificationOptions` contract from #811, for consumers that prefer it whole. */
  options: AudioNotificationOptions;
  setSoundEnabled: (enabled: boolean) => void;
  setVolume: (volume: number) => void;
  /** Play the chime now, honouring every gate. Returns whether it fired. */
  playChime: () => boolean;
  /**
   * Play the chime at the selected volume, ignoring only the visitor's own
   * mute. Used by the settings "Test sound" control — a deliberate click is
   * exactly the user gesture that unlocks autoplay, so previewing while muted
   * is what makes the volume slider meaningful. Reduced-motion and
   * unsupported-browser gates still apply.
   */
  previewChime: () => boolean;
}

/**
 * Why the chime is currently suppressed. `null` means nothing is.
 *
 * Note there is no "muted volume" case: `normalizeAudioNotificationVolume`
 * floors the stored volume above zero (an exponential gain ramp cannot target
 * silence anyway), so muting is exclusively the toggle's job.
 */
export type AudioSuppressionReason =
  "disabled" | "reduced-motion" | "unsupported";

const AudioNotificationsContext =
  createContext<AudioNotificationsContextValue | null>(null);

/**
 * Provides the live-chat chime preference to the whole app (#811).
 *
 * Mirrors hooks/useTimeFormat.tsx: persisted in localStorage, read after mount
 * to avoid hydration drift, and synced across tabs via the `storage` event so
 * muting sound in one tab mutes it in the next.
 *
 * Every call to `playChime` re-checks the gate at call time rather than
 * capturing it — the visitor can turn reduced motion on, mute the volume, or
 * revoke autoplay permission between renders.
 */
export function AudioNotificationsProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [preferences, setPreferencesState] =
    useState<AudioNotificationPreferences>(
      DEFAULT_AUDIO_NOTIFICATION_PREFERENCES
    );
  const [hydrated, setHydrated] = useState(false);
  const [reducedSound, setReducedSound] = useState(false);
  const [supported, setSupported] = useState(true);
  const mediaQueryRef = useRef<MediaQueryList | null>(null);
  // Setters read from this ref rather than from `preferences` so two changes
  // landing in the same tick (a volume-slider drag, say) both survive.
  const preferencesRef = useRef(preferences);

  useEffect(() => {
    const stored = readAudioNotificationPreferences();
    preferencesRef.current = stored;
    setPreferencesState(stored);
    setHydrated(true);
  }, []);

  // Track reduced-motion live: the OS setting can change mid-session, and a
  // visitor who turns it on should not keep hearing chimes.
  useEffect(() => {
    if (
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function"
    ) {
      setReducedSound(false);
      return;
    }

    function sync() {
      setReducedSound(prefersReducedSound());
    }

    let media: MediaQueryList | null = null;
    try {
      media = window.matchMedia("(prefers-reduced-motion: reduce)");
    } catch {
      media = null;
    }

    sync();
    if (media) {
      mediaQueryRef.current = media;
      media.addEventListener?.("change", sync);
    }

    return () => {
      media?.removeEventListener?.("change", sync);
      mediaQueryRef.current = null;
    };
  }, []);

  useEffect(() => {
    function onStorage(event: StorageEvent) {
      if (event.key !== AUDIO_NOTIFICATION_STORAGE_KEY || !event.newValue)
        return;
      try {
        const parsed: unknown = JSON.parse(event.newValue);
        if (isAudioNotificationPreferences(parsed)) {
          const next = {
            soundEnabled: parsed.soundEnabled,
            volume: normalizeAudioNotificationVolume(parsed.volume),
          };
          preferencesRef.current = next;
          setPreferencesState(next);
        }
      } catch {
        // Ignore malformed values written by another tab.
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const persist = useCallback((next: AudioNotificationPreferences) => {
    preferencesRef.current = next;
    setPreferencesState(next);
    writeAudioNotificationPreferences(next);
  }, []);

  const setSoundEnabled = useCallback(
    (enabled: boolean) => {
      persist({ ...preferencesRef.current, soundEnabled: enabled });
    },
    [persist]
  );

  const setVolume = useCallback(
    (volume: number) => {
      persist({
        ...preferencesRef.current,
        volume: normalizeAudioNotificationVolume(volume),
      });
    },
    [persist]
  );

  // Web Audio support can only be probed in the browser; until the first
  // effect runs we optimistically report support so SSR/hydration agree.
  useEffect(() => {
    setSupported(isChimeSupported());
  }, []);

  const resolveSuppression = useCallback((): AudioSuppressionReason | null => {
    if (!supported) return "unsupported";
    if (!preferences.soundEnabled) return "disabled";
    if (reducedSound) return "reduced-motion";
    return null;
  }, [preferences, reducedSound, supported]);

  const playChime = useCallback((): boolean => {
    if (resolveSuppression()) return false;
    return playSynthesizedChime(preferences.volume);
  }, [preferences.volume, resolveSuppression]);

  const previewChime = useCallback((): boolean => {
    if (!supported) return false;
    if (reducedSound) return false;
    return playSynthesizedChime(preferences.volume);
  }, [preferences.volume, reducedSound, supported]);

  const suppressionReason = resolveSuppression();

  const value = useMemo<AudioNotificationsContextValue>(
    () => ({
      soundEnabled: preferences.soundEnabled,
      volume: preferences.volume,
      hydrated,
      active: suppressionReason === null,
      suppressionReason,
      options: {
        soundEnabled: preferences.soundEnabled,
        volume: preferences.volume,
        playChime: () => {
          playChime();
        },
      },
      setSoundEnabled,
      setVolume,
      playChime,
      previewChime,
    }),
    [
      hydrated,
      playChime,
      previewChime,
      preferences,
      setSoundEnabled,
      setVolume,
      suppressionReason,
    ]
  );

  return (
    <AudioNotificationsContext.Provider value={value}>
      {children}
    </AudioNotificationsContext.Provider>
  );
}

/**
 * Access the live-chat chime preference and a gated `playChime`.
 * Must be used within an AudioNotificationsProvider.
 */
export function useAudioNotifications(): AudioNotificationsContextValue {
  const ctx = useContext(AudioNotificationsContext);
  if (!ctx) {
    throw new Error(
      "useAudioNotifications must be used within an AudioNotificationsProvider"
    );
  }
  return ctx;
}
