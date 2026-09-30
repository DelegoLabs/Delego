import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ReactNode } from "react";

import {
  AGENT_MESSAGE_CHIME_TONES,
  resetSharedAudioContext,
} from "../lib/audioChime";
import { AUDIO_NOTIFICATION_STORAGE_KEY } from "../lib/audioNotification";
import {
  AudioNotificationsProvider,
  useAudioNotifications,
} from "./useAudioNotifications";
import {
  installFakeAudioContext,
  mockMatchMedia,
  type FakeAudioContext,
} from "../tests/fakeAudioContext";

/**
 * Wiring check with lib/audioChime left un-mocked, so the assertions run all
 * the way down to `AudioContext.createOscillator`. hooks/useAudioNotifications.test.tsx
 * mocks the synthesis to isolate the gating decisions; this file guards the
 * seam between the two — that a permitted `playChime()` really synthesises the
 * documented chime rather than quietly doing nothing.
 */
let context: FakeAudioContext;
let uninstallAudio: () => void;
let uninstallMatchMedia: () => void;

function wrapper({ children }: { children: ReactNode }) {
  return <AudioNotificationsProvider>{children}</AudioNotificationsProvider>;
}

function store(soundEnabled: boolean, volume: number) {
  window.localStorage.setItem(
    AUDIO_NOTIFICATION_STORAGE_KEY,
    JSON.stringify({ soundEnabled, volume })
  );
}

beforeEach(() => {
  window.localStorage.clear();
  resetSharedAudioContext();
  delete document.documentElement.dataset.reduceMotion;
  const installed = installFakeAudioContext();
  context = installed.context;
  uninstallAudio = installed.uninstall;
  uninstallMatchMedia = mockMatchMedia(false);
});

afterEach(() => {
  uninstallAudio();
  uninstallMatchMedia();
  window.localStorage.clear();
  resetSharedAudioContext();
  delete document.documentElement.dataset.reduceMotion;
});

describe("useAudioNotifications — real synthesis wiring", () => {
  it("schedules the agent chime on the shared AudioContext", async () => {
    store(true, 0.5);
    const { result } = renderHook(() => useAudioNotifications(), { wrapper });
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    act(() => {
      result.current.playChime();
    });

    expect(context.createOscillator).toHaveBeenCalledTimes(
      AGENT_MESSAGE_CHIME_TONES.length
    );
    expect(context.oscillators.map((o) => o.frequency.value)).toEqual(
      AGENT_MESSAGE_CHIME_TONES.map((tone) => tone.frequency)
    );
  });

  it("routes options.playChime through the same path", async () => {
    store(true, 0.5);
    const { result } = renderHook(() => useAudioNotifications(), { wrapper });
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    act(() => {
      result.current.options.playChime();
    });

    expect(context.createOscillator).toHaveBeenCalledTimes(
      AGENT_MESSAGE_CHIME_TONES.length
    );
  });

  it("previews through the real synthesis even while muted", async () => {
    const { result } = renderHook(() => useAudioNotifications(), { wrapper });
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    expect(result.current.soundEnabled).toBe(false);
    act(() => {
      result.current.previewChime();
    });

    expect(context.createOscillator).toHaveBeenCalledTimes(
      AGENT_MESSAGE_CHIME_TONES.length
    );
  });

  it("creates no audio at all while muted, not even a context", async () => {
    const { result } = renderHook(() => useAudioNotifications(), { wrapper });
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    act(() => {
      result.current.playChime();
    });

    expect(context.createOscillator).not.toHaveBeenCalled();
    expect(context.resume).not.toHaveBeenCalled();
  });

  it("creates no audio when reduced motion is requested", async () => {
    uninstallMatchMedia();
    uninstallMatchMedia = mockMatchMedia(true);
    store(true, 0.5);

    const { result } = renderHook(() => useAudioNotifications(), { wrapper });
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    act(() => {
      result.current.playChime();
      result.current.previewChime();
    });

    expect(context.createOscillator).not.toHaveBeenCalled();
  });

  it("scales the synthesised master gain with the selected volume", async () => {
    store(true, 0.25);
    const { result } = renderHook(() => useAudioNotifications(), { wrapper });
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    act(() => {
      result.current.playChime();
    });

    // lib/audioChime keeps the master gain at volume * MASTER_GAIN (0.6) so a
    // full-volume preference still lands well under a notification tone.
    expect(context.gains[0].gain.value).toBeCloseTo(0.25 * 0.6, 5);
  });
});
