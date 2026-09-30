"use client";

import { useTranslations } from "next-intl";

import { Card, Button } from "@delegolabs/ui";
import { useAudioNotifications } from "../../hooks/useAudioNotifications";
import {
  MAX_AUDIO_NOTIFICATION_VOLUME,
  MIN_AUDIO_NOTIFICATION_VOLUME,
} from "../../lib/audioNotification";

const VOLUME_STEP = 0.05;

/**
 * Chat settings section for the live-chat audio ping (#811).
 *
 * Mirrors components/settings/AccessibilitySettingsCard.tsx: a checkbox
 * opt-in, a volume slider, and a "Test sound" control — the last one matters
 * because browsers only allow audio after a user gesture, so a visitor who
 * enables the chime here immediately hears the exact level they picked.
 *
 * The card reads (never writes) the reduced-motion state through
 * useAudioNotifications, so the copy can explain *why* a chime is currently
 * suppressed instead of leaving the toggle looking broken.
 */
export function ChatAudioSettingsCard() {
  const t = useTranslations("settings.chatAudio");
  const {
    soundEnabled,
    volume,
    active,
    suppressionReason,
    setSoundEnabled,
    setVolume,
    previewChime,
  } = useAudioNotifications();

  const suppressionCopy =
    suppressionReason === "unsupported"
      ? t("unsupportedHint")
      : suppressionReason === "reduced-motion"
        ? t("reducedMotionHint")
        : null;

  return (
    <Card title={t("title")} ariaLabel={t("ariaLabel")}>
      <div className="settings-section">
        <label className="settings-toggle-row">
          <span>
            <span className="settings-toggle-label">{t("toggleLabel")}</span>
            <p className="settings-toggle-hint">{t("toggleHint")}</p>
            {suppressionCopy && (
              <p className="settings-toggle-hint">{suppressionCopy}</p>
            )}
          </span>
          <input
            type="checkbox"
            checked={soundEnabled}
            onChange={(event) => setSoundEnabled(event.target.checked)}
            style={{
              width: "1.125rem",
              height: "1.125rem",
              marginTop: "0.25rem",
            }}
          />
        </label>

        <div
          className="settings-toggle-row"
          style={{
            flexDirection: "column",
            alignItems: "stretch",
            gap: "0.5rem",
          }}
        >
          <span className="settings-toggle-label" id="chat-audio-volume-label">
            {t("volumeLabel")}
          </span>
          <input
            type="range"
            min={MIN_AUDIO_NOTIFICATION_VOLUME}
            max={MAX_AUDIO_NOTIFICATION_VOLUME}
            step={VOLUME_STEP}
            value={volume}
            onChange={(event) => setVolume(Number(event.target.value))}
            aria-labelledby="chat-audio-volume-label"
            aria-valuetext={`${Math.round(volume * 100)}%`}
            disabled={!soundEnabled}
            style={{ width: "100%", cursor: "pointer" }}
          />
          <p className="settings-toggle-hint">{t("volumeHint")}</p>
        </div>

        <div
          style={{
            marginTop: "0.75rem",
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
          }}
        >
          <Button variant="secondary" onClick={() => previewChime()}>
            {t("testSound")}
          </Button>
          {!active && !suppressionCopy && (
            <span className="settings-toggle-hint">{t("mutedHint")}</span>
          )}
        </div>
      </div>
    </Card>
  );
}
