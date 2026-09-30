"use client";

import { useId, useState } from "react";
import { useVoiceInput } from "../../hooks/useVoiceInput";

export interface VoiceInputButtonProps {
  onTranscript: (text: string) => void;
  disabled?: boolean;
  label?: string;
  lang?: string;
  className?: string;
}

const UNSUPPORTED_MESSAGE = "Voice input isn't supported in this browser.";
const WAVE_BARS = [0, 1, 2, 3, 4];

/**
 * Mic button that dictates agent purchase instructions via the Web Speech API
 * (#681, #800). Finalized speech is passed to `onTranscript` so the caller can drop
 * it straight into its chat input.
 */
export function VoiceInputButton({
  onTranscript,
  disabled = false,
  label,
  className,
}: VoiceInputButtonProps) {
  const { isListening, transcript, error, isSupported, start, stop } =
    useVoiceInput(onTranscript);
  const [showTooltip, setShowTooltip] = useState(false);
  const tooltipId = useId();
  const statusId = useId();

  const isDisabled = disabled || !isSupported;
  const ariaLabel = isListening ? "Stop voice input" : label ?? "Start voice input";

  return (
    <span
      className={className}
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        gap: "0.5rem",
      }}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <style>{`
        @keyframes delego-voice-wave {
          0%, 100% { transform: scaleY(0.35); }
          50% { transform: scaleY(1); }
        }
        @media (prefers-reduced-motion: reduce) {
          .delego-voice-bar { animation: none !important; }
        }
      `}</style>

      <button
        type="button"
        onClick={isListening ? stop : start}
        disabled={isDisabled}
        aria-label={ariaLabel}
        aria-pressed={isListening}
        aria-describedby={
          !isSupported ? tooltipId : error ? statusId : undefined
        }
        onFocus={() => setShowTooltip(true)}
        onBlur={() => setShowTooltip(false)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 40,
          height: 40,
          borderRadius: "9999px",
          border: "1px solid #d1d5db",
          background: isListening ? "#dc2626" : "#fff",
          color: isListening ? "#fff" : "#374151",
          cursor: isDisabled ? "not-allowed" : "pointer",
          opacity: isDisabled ? 0.5 : 1,
        }}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <rect x="9" y="3" width="6" height="12" rx="3" fill="currentColor" />
          <path
            d="M5 11a7 7 0 0 0 14 0M12 18v3"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </button>

      {isListening && (
        <span
          data-testid="voice-waveform"
          aria-hidden="true"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 3,
            height: 20,
          }}
        >
          {WAVE_BARS.map((i) => (
            <span
              key={i}
              className="delego-voice-bar"
              style={{
                width: 3,
                height: "100%",
                borderRadius: 2,
                background: "#dc2626",
                transformOrigin: "center",
                animation: `delego-voice-wave 0.9s ease-in-out ${i * 0.12}s infinite`,
              }}
            />
          ))}
        </span>
      )}

      <span
        id={statusId}
        role="status"
        aria-live="polite"
        style={{ fontSize: "0.75rem" }}
      >
        {error ? (
          <span style={{ color: "#dc2626" }}>{error}</span>
        ) : isListening ? (
          <span style={{ color: "#6b7280" }}>{transcript || "Listening…"}</span>
        ) : null}
      </span>

      {!isSupported && (
        <span
          id={tooltipId}
          role="tooltip"
          style={{
            position: "absolute",
            bottom: "calc(100% + 6px)",
            left: 0,
            whiteSpace: "nowrap",
            padding: "0.25rem 0.5rem",
            borderRadius: "0.375rem",
            background: "#111827",
            color: "#fff",
            fontSize: "0.75rem",
            visibility: showTooltip ? "visible" : "hidden",
          }}
        >
          {UNSUPPORTED_MESSAGE}
        </span>
      )}
    </span>
  );
}
