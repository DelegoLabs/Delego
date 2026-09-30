"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Voice input for the conversational buyer agent (#800).
 *
 * Wraps the browser Web Speech API (`SpeechRecognition` / the Safari
 * `webkitSpeechRecognition` alias) in a small React hook that exposes the
 * current listening state and a live transcript preview. The API is not
 * implemented in every browser (notably Firefox), so callers should also
 * check `isSpeechRecognitionSupported`.
 */

export interface SpeechRecognitionHook {
  isListening: boolean;
  transcript: string;
  startListening(): void;
  stopListening(): void;
}

interface RecognitionAlternative {
  readonly transcript: string;
}

interface RecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  readonly [index: number]: RecognitionAlternative;
}

interface RecognitionResultList {
  readonly length: number;
  readonly [index: number]: RecognitionResult;
}

interface RecognitionResultEvent {
  readonly resultIndex: number;
  readonly results: RecognitionResultList;
}

interface RecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: RecognitionResultEvent) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onend: (() => void) | null;
}

type RecognitionConstructor = new () => RecognitionLike;

function getRecognitionConstructor(): RecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const scope = window as unknown as {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
}

/** True when the current browser exposes the Web Speech recognition API. */
export function isSpeechRecognitionSupported(): boolean {
  return getRecognitionConstructor() !== null;
}

/** Joins every result (final and interim) into a single transcript string. */
function collectTranscript(results: RecognitionResultList): string {
  let transcript = "";
  for (let i = 0; i < results.length; i += 1) {
    transcript += results[i]?.[0]?.transcript ?? "";
  }
  return transcript;
}

export interface UseSpeechRecognitionOptions {
  /** BCP-47 language tag, e.g. "en-US". */
  lang?: string;
  /** Called with the updated transcript as results stream in. */
  onTranscript?: (transcript: string) => void;
}

export function useSpeechRecognition(
  options: UseSpeechRecognitionOptions = {}
): SpeechRecognitionHook {
  const { lang = "en-US" } = options;
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const recognitionRef = useRef<RecognitionLike | null>(null);

  // Keep the latest callback in a ref so changing it never tears down the
  // active recognition instance.
  const onTranscriptRef = useRef(options.onTranscript);
  useEffect(() => {
    onTranscriptRef.current = options.onTranscript;
  }, [options.onTranscript]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setIsListening(false);
  }, []);

  const startListening = useCallback(() => {
    const Recognition = getRecognitionConstructor();
    if (!Recognition) return;

    const recognition = recognitionRef.current ?? new Recognition();
    recognitionRef.current = recognition;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = lang;

    recognition.onresult = (event) => {
      const next = collectTranscript(event.results);
      setTranscript(next);
      onTranscriptRef.current?.(next);
    };
    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);

    setTranscript("");
    try {
      recognition.start();
      setIsListening(true);
    } catch {
      // start() throws if called while already running; keep the current state.
    }
  }, [lang]);

  // Abort any in-flight session when the component unmounts.
  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
      recognitionRef.current = null;
    };
  }, []);

  return { isListening, transcript, startListening, stopListening };
}
