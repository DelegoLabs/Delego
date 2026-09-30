import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { VoiceInputButton } from "./VoiceInputButton";
import type { SpeechRecognitionLike } from "../../hooks/useVoiceInput";

let instance: FakeRecognition | null = null;

class FakeRecognition implements SpeechRecognitionLike {
  lang = "";
  continuous = false;
  interimResults = false;
  onresult: SpeechRecognitionLike["onresult"] = null;
  onerror: SpeechRecognitionLike["onerror"] = null;
  onend: SpeechRecognitionLike["onend"] = null;
  start = vi.fn();
  stop = vi.fn(() => this.onend?.());
  abort = vi.fn();
  constructor() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    instance = this;
  }
}

function speak(text: string, isFinal: boolean) {
  const result = Object.assign([{ transcript: text }], { isFinal });
  act(() => instance!.onresult?.({ resultIndex: 0, results: [result] }));
}

function setRecognition(ctor: unknown) {
  (window as unknown as Record<string, unknown>).SpeechRecognition = ctor;
}

afterEach(() => {
  delete (window as unknown as Record<string, unknown>).SpeechRecognition;
  instance = null;
});

describe("VoiceInputButton", () => {
  it("is disabled with a tooltip when the browser lacks Web Speech", () => {
    render(<VoiceInputButton onTranscript={vi.fn()} />);
    const button = screen.getByRole("button", { name: "Start voice input" });
    const tooltip = screen.getByRole("tooltip", { hidden: true });
    expect(button).toBeDisabled();
    expect(tooltip).toHaveTextContent(/isn't supported/);
    expect(button).toHaveAttribute("aria-describedby", tooltip.id);
  });

  it("listens, animates a waveform and injects the final transcript", () => {
    setRecognition(FakeRecognition);
    const onTranscript = vi.fn();
    render(<VoiceInputButton onTranscript={onTranscript} />);

    fireEvent.click(screen.getByRole("button", { name: "Start voice input" }));
    expect(instance!.start).toHaveBeenCalled();
    expect(screen.getByTestId("voice-waveform")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Stop voice input" })
    ).toHaveAttribute("aria-pressed", "true");

    speak("buy running", false);
    expect(screen.getByRole("status")).toHaveTextContent("buy running");
    expect(onTranscript).not.toHaveBeenCalled();

    speak("buy running shoes size 42", true);
    expect(onTranscript).toHaveBeenCalledWith("buy running shoes size 42");

    fireEvent.click(screen.getByRole("button", { name: "Stop voice input" }));
    expect(screen.queryByTestId("voice-waveform")).not.toBeInTheDocument();
  });

  it("does nothing when disabled by the caller", () => {
    setRecognition(FakeRecognition);
    render(<VoiceInputButton onTranscript={vi.fn()} disabled />);
    expect(
      screen.getByRole("button", { name: "Start voice input" })
    ).toBeDisabled();
    expect(
      screen.queryByRole("tooltip", { hidden: true })
    ).not.toBeInTheDocument();
  });

  it("surfaces recognition errors", () => {
    setRecognition(FakeRecognition);
    render(<VoiceInputButton onTranscript={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Start voice input" }));
    act(() => instance!.onerror?.({ error: "not-allowed" }));
    expect(screen.getByRole("status")).toHaveTextContent(/denied/);
  });
});
