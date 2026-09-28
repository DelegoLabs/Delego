import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VoiceInputButton } from "./VoiceInputButton";

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

beforeEach(() => {
  instance = new FakeRecognition();
  (window as unknown as Record<string, unknown>).SpeechRecognition = vi.fn(
    () => instance
  );
});

afterEach(() => {
  delete (window as unknown as Record<string, unknown>).SpeechRecognition;
  vi.restoreAllMocks();
});

describe("VoiceInputButton", () => {
  it("renders a microphone button that becomes available once mounted", async () => {
    render(<VoiceInputButton onTranscript={vi.fn()} />);
    await waitFor(() =>
      expect(screen.getByRole("button")).toBeEnabled()
    );
    expect(screen.getByRole("button")).toHaveAccessibleName(/voice input/i);
  });

  it("toggles recording and emits the transcript to the caller", async () => {
    const user = userEvent.setup();
    const onTranscript = vi.fn();
    render(<VoiceInputButton onTranscript={onTranscript} />);

    const button = screen.getByRole("button");
    await waitFor(() => expect(button).toBeEnabled());

    await user.click(button);

    expect(button).toHaveAttribute("aria-pressed", "true");
    expect(button).toHaveClass("is-listening");

    act(() => instance.emit("order coffee"));

    expect(onTranscript).toHaveBeenCalledWith("order coffee");

    await user.click(button);

    expect(button).toHaveAttribute("aria-pressed", "false");
    expect(instance.stop).toHaveBeenCalled();
  });

  it("is disabled when the browser has no speech recognition support", async () => {
    delete (window as unknown as Record<string, unknown>).SpeechRecognition;
    render(<VoiceInputButton onTranscript={vi.fn()} />);
    expect(screen.getByRole("button")).toBeDisabled();
  });
});
