"use client";

import { useEffect, useState } from "react";
import {
  isSpeechRecognitionSupported,
  useSpeechRecognition,
} from "../../hooks/useSpeechRecognition";

export interface VoiceInputButtonProps {
  /** Called with the live transcript as the user speaks. */
  onTranscript: (transcript: string) => void;
  /** BCP-47 language tag for recognition, e.g. "en-US". */
  lang?: string;
  disabled?: boolean;
  /** Accessible label override; defaults to a sensible "start/stop" label. */
  label?: string;
}

/**
 * Pulsing microphone button that dictates into the conversational agent
 * prompt (#800). While recording, `onTranscript` is called on every interim
 * result so the chat input updates in real time.
 */
export function VoiceInputButton({
  onTranscript,
  lang,
  disabled = false,
  label,
}: VoiceInputButtonProps) {
  const { isListening, startListening, stopListening } = useSpeechRecognition({
    lang,
    onTranscript,
  });
  // Resolved after mount so server and first client render agree.
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    setSupported(isSpeechRecognitionSupported());
  }, []);

  const isDisabled = disabled || !supported;

  return (
    <button
      type="button"
      className={`voice-input-button${isListening ? " is-listening" : ""}`}
      aria-label={
        isListening
          ? "Stop voice input"
          : label ?? "Start voice input"
      }
      aria-pressed={isListening}
      disabled={isDisabled}
      title={
        supported ? undefined : "Voice input is not supported in this browser"
      }
      onClick={() => (isListening ? stopListening() : startListening())}
    >
      {isListening && <span className="voice-input-pulse" aria-hidden="true" />}
      <svg
        className="voice-input-icon"
        viewBox="0 0 24 24"
        width="18"
        height="18"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
      >
        <path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
        <path d="M19 10v1a7 7 0 0 1-14 0v-1" />
        <line x1="12" y1="19" x2="12" y2="22" />
        <line x1="8" y1="22" x2="16" y2="22" />
      </svg>
    </button>
  );
}
