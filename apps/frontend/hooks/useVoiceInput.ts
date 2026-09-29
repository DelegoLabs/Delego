"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface VoiceInputState {
  isListening: boolean;
  transcript: string;
  error: string | null;
  isSupported: boolean;
}

export interface UseVoiceInputResult extends VoiceInputState {
  start: () => void;
  stop: () => void;
}

// Minimal Web Speech API surface — lib.dom doesn't ship these types.
interface SpeechRecognitionAlternativeLike {
  transcript: string;
}
interface SpeechRecognitionResultLike {
  readonly isFinal: boolean;
  readonly length: number;
  [index: number]: SpeechRecognitionAlternativeLike;
}
interface SpeechRecognitionEventLike {
  readonly resultIndex: number;
  readonly results: ArrayLike<SpeechRecognitionResultLike>;
}
interface SpeechRecognitionErrorEventLike {
  readonly error: string;
}
export interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

export function getSpeechRecognition(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const ERROR_MESSAGES: Record<string, string> = {
  "not-allowed": "Microphone access was denied.",
  "service-not-allowed": "Microphone access was denied.",
  "no-speech": "No speech was detected. Try again.",
  "audio-capture": "No microphone was found.",
  network: "Speech recognition needs a network connection.",
};

/**
 * Web Speech API recognition hook (#681). `onFinal` fires with each finalized
 * utterance so callers can inject it into an input; `transcript` also carries
 * interim text for live feedback while listening.
 */
export function useVoiceInput(
  onFinal?: (text: string) => void,
  lang?: string
): UseVoiceInputResult {
  // Detected after mount so server and first client render agree.
  const [isSupported, setIsSupported] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const onFinalRef = useRef(onFinal);
  onFinalRef.current = onFinal;

  useEffect(() => {
    setIsSupported(getSpeechRecognition() !== null);
    return () => recognitionRef.current?.abort();
  }, []);

  const start = useCallback(() => {
    const Recognition = getSpeechRecognition();
    if (!Recognition) {
      setError("Voice input isn't supported in this browser.");
      return;
    }
    if (recognitionRef.current) return;

    const recognition = new Recognition();
    recognition.lang =
      lang ?? (typeof navigator !== "undefined" ? navigator.language : "en-US");
    recognition.continuous = false;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
      let interim = "";
      let final = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) final += result[0].transcript;
        else interim += result[0].transcript;
      }
      setTranscript((final || interim).trim());
      if (final.trim()) onFinalRef.current?.(final.trim());
    };
    recognition.onerror = (event) => {
      if (event.error === "aborted") return;
      setError(ERROR_MESSAGES[event.error] ?? "Voice input failed. Try again.");
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    setError(null);
    setTranscript("");
    try {
      recognition.start();
      setIsListening(true);
    } catch {
      recognitionRef.current = null;
      setError("Voice input failed to start. Try again.");
    }
  }, [lang]);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  return { isListening, transcript, error, isSupported, start, stop };
}
