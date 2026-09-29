import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  isSpeechRecognitionSupported,
  useSpeechRecognition,
} from "./useSpeechRecognition";

class FakeRecognition {
  continuous = false;
  interimResults = false;
  lang = "";
  onresult: ((event: unknown) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onend: (() => void) | null = null;
  start = vi.fn();
  stop = vi.fn();
  abort = vi.fn();

  emit(transcript: string) {
    this.onresult?.({
      resultIndex: 0,
      results: [[{ transcript, confidence: 1 }]],
    });
  }
}

let instance: FakeRecognition;

function stubSpeechRecognition() {
  instance = new FakeRecognition();
  (window as unknown as Record<string, unknown>).SpeechRecognition = vi.fn(
    () => instance
  );
}

beforeEach(() => {
  stubSpeechRecognition();
});

afterEach(() => {
  delete (window as unknown as Record<string, unknown>).SpeechRecognition;
  delete (window as unknown as Record<string, unknown>).webkitSpeechRecognition;
  vi.restoreAllMocks();
});

describe("isSpeechRecognitionSupported", () => {
  it("reflects availability of the Web Speech API", () => {
    expect(isSpeechRecognitionSupported()).toBe(true);

    delete (window as unknown as Record<string, unknown>).SpeechRecognition;
    expect(isSpeechRecognitionSupported()).toBe(false);
  });

  it("accepts the webkit-prefixed Safari constructor", () => {
    delete (window as unknown as Record<string, unknown>).SpeechRecognition;
    (window as unknown as Record<string, unknown>).webkitSpeechRecognition =
      vi.fn(() => new FakeRecognition());
    expect(isSpeechRecognitionSupported()).toBe(true);
  });
});

describe("useSpeechRecognition", () => {
  it("starts listening, streams the transcript, and stops", () => {
    const onTranscript = vi.fn();
    const { result } = renderHook(() =>
      useSpeechRecognition({ onTranscript })
    );

    expect(result.current.isListening).toBe(false);

    act(() => result.current.startListening());

    expect(instance.start).toHaveBeenCalledTimes(1);
    expect(result.current.isListening).toBe(true);
    expect(instance.continuous).toBe(true);
    expect(instance.interimResults).toBe(true);

    act(() => instance.emit("buy a laptop"));

    expect(result.current.transcript).toBe("buy a laptop");
    expect(onTranscript).toHaveBeenCalledWith("buy a laptop");

    act(() => result.current.stopListening());

    expect(instance.stop).toHaveBeenCalledTimes(1);
    expect(result.current.isListening).toBe(false);
  });

  it("clears the transcript between sessions", () => {
    const { result } = renderHook(() => useSpeechRecognition());

    act(() => result.current.startListening());
    act(() => instance.emit("first"));
    expect(result.current.transcript).toBe("first");

    act(() => result.current.stopListening());
    act(() => result.current.startListening());
    expect(result.current.transcript).toBe("");
  });

  it("resets listening state when recognition ends or errors", () => {
    const { result } = renderHook(() => useSpeechRecognition());

    act(() => result.current.startListening());
    act(() => instance.onend?.());
    expect(result.current.isListening).toBe(false);

    act(() => result.current.startListening());
    act(() => instance.onerror?.({ error: "not-allowed" }));
    expect(result.current.isListening).toBe(false);
  });

  it("aborts recognition on unmount", () => {
    const { result, unmount } = renderHook(() => useSpeechRecognition());

    act(() => result.current.startListening());
    unmount();

    expect(instance.abort).toHaveBeenCalledTimes(1);
  });

  it("is a no-op when the API is unavailable", () => {
    delete (window as unknown as Record<string, unknown>).SpeechRecognition;
    const { result } = renderHook(() => useSpeechRecognition());

    act(() => result.current.startListening());

    expect(result.current.isListening).toBe(false);
  });
});
