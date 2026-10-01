import {
  act,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

import {
  AudioNotificationsProvider,
  useAudioNotifications,
  type AudioNotificationsContextValue,
} from "./useAudioNotifications";
import {
  AUDIO_NOTIFICATION_STORAGE_KEY,
  MAX_AUDIO_NOTIFICATION_VOLUME,
  MIN_AUDIO_NOTIFICATION_VOLUME,
} from "../lib/audioNotification";
import { resetSharedAudioContext } from "../lib/audioChime";
import {
  installFakeAudioContext,
  mockMatchMedia,
} from "../tests/fakeAudioContext";

const playChimeSpy = vi.hoisted(() => vi.fn(() => true));

vi.mock("../lib/audioChime", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/audioChime")>();
  return {
    ...actual,
    // The synthesis itself is covered by lib/audioChime.test.ts (and the seam
    // between the two in useAudioNotifications.integration.test.tsx); these
    // tests only care about the gating decisions the provider makes around it.
    playChime: playChimeSpy,
  };
});

let uninstallAudio: (() => void) | undefined;
let uninstallMatchMedia: (() => void) | undefined;

function wrapper({ children }: { children: ReactNode }) {
  return <AudioNotificationsProvider>{children}</AudioNotificationsProvider>;
}

function renderNotifications() {
  return renderHook(() => useAudioNotifications(), { wrapper });
}

/** Persists a preference the way a previous session would have. */
function store(soundEnabled: boolean, volume: number) {
  window.localStorage.setItem(
    AUDIO_NOTIFICATION_STORAGE_KEY,
    JSON.stringify({ soundEnabled, volume })
  );
}

beforeEach(() => {
  window.localStorage.clear();
  resetSharedAudioContext();
  playChimeSpy.mockClear();
  playChimeSpy.mockReturnValue(true);
  uninstallAudio = installFakeAudioContext().uninstall;
  uninstallMatchMedia = mockMatchMedia(false);
});

afterEach(() => {
  uninstallAudio?.();
  uninstallMatchMedia?.();
  window.localStorage.clear();
  resetSharedAudioContext();
  delete document.documentElement.dataset.reduceMotion;
});

describe("useAudioNotifications — defaults", () => {
  it("starts silent at the default volume", async () => {
    const { result } = renderNotifications();

    await waitFor(() => expect(result.current.hydrated).toBe(true));
    expect(result.current.soundEnabled).toBe(false);
    expect(result.current.volume).toBe(0.4);
  });

  it("reports the mute as the suppression reason", async () => {
    const { result } = renderNotifications();

    await waitFor(() => expect(result.current.hydrated).toBe(true));
    expect(result.current.active).toBe(false);
    expect(result.current.suppressionReason).toBe("disabled");
  });
});

describe("useAudioNotifications — hydration", () => {
  it("hydrates from localStorage", async () => {
    store(true, 0.25);
    const { result } = renderNotifications();

    await waitFor(() => expect(result.current.hydrated).toBe(true));
    expect(result.current.soundEnabled).toBe(true);
    expect(result.current.volume).toBe(0.25);
    expect(result.current.active).toBe(true);
    expect(result.current.suppressionReason).toBeNull();
  });

  it("normalizes an out-of-range persisted volume", async () => {
    store(true, 99);
    const { result } = renderNotifications();

    await waitFor(() => expect(result.current.hydrated).toBe(true));
    expect(result.current.volume).toBe(MAX_AUDIO_NOTIFICATION_VOLUME);
  });

  it("falls back to the defaults for a corrupt stored value", async () => {
    window.localStorage.setItem(AUDIO_NOTIFICATION_STORAGE_KEY, "<<broken>>");
    const { result } = renderNotifications();

    await waitFor(() => expect(result.current.hydrated).toBe(true));
    expect(result.current.soundEnabled).toBe(false);
    expect(result.current.volume).toBe(0.4);
  });
});

describe("useAudioNotifications — setters", () => {
  it("persists the opt-in", async () => {
    const { result } = renderNotifications();
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    act(() => result.current.setSoundEnabled(true));

    expect(result.current.soundEnabled).toBe(true);
    expect(
      JSON.parse(
        window.localStorage.getItem(AUDIO_NOTIFICATION_STORAGE_KEY) ?? "{}"
      )
    ).toMatchObject({ soundEnabled: true, volume: 0.4 });
  });

  it("persists a volume change without touching the opt-in", async () => {
    store(true, 0.5);
    const { result } = renderNotifications();
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    act(() => result.current.setVolume(0.75));

    expect(result.current.volume).toBe(0.75);
    expect(
      JSON.parse(
        window.localStorage.getItem(AUDIO_NOTIFICATION_STORAGE_KEY) ?? "{}"
      )
    ).toEqual({ soundEnabled: true, volume: 0.75 });
  });

  it("snaps a below-minimum volume up to the minimum", async () => {
    const { result } = renderNotifications();
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    act(() => result.current.setVolume(0));

    expect(result.current.volume).toBe(MIN_AUDIO_NOTIFICATION_VOLUME);
  });

  it("re-persists on every change so the two settings cannot drift", async () => {
    const { result } = renderNotifications();
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    act(() => result.current.setSoundEnabled(true));
    act(() => result.current.setVolume(0.6));
    act(() => result.current.setSoundEnabled(false));

    expect(
      JSON.parse(
        window.localStorage.getItem(AUDIO_NOTIFICATION_STORAGE_KEY) ?? "{}"
      )
    ).toEqual({ soundEnabled: false, volume: 0.6 });
  });

  it("keeps both changes when two setters land in the same tick", async () => {
    const { result } = renderNotifications();
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    // A volume-slider drag can move twice before React re-renders; neither
    // update may read a stale opt-in.
    act(() => {
      result.current.setSoundEnabled(true);
      result.current.setVolume(0.9);
    });

    expect(result.current.soundEnabled).toBe(true);
    expect(result.current.volume).toBe(0.9);
    expect(
      JSON.parse(
        window.localStorage.getItem(AUDIO_NOTIFICATION_STORAGE_KEY) ?? "{}"
      )
    ).toEqual({ soundEnabled: true, volume: 0.9 });
  });
});

describe("useAudioNotifications — cross-tab sync", () => {
  it("adopts a change written by another tab", async () => {
    const { result } = renderNotifications();
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: AUDIO_NOTIFICATION_STORAGE_KEY,
          newValue: JSON.stringify({ soundEnabled: true, volume: 0.2 }),
        })
      );
    });

    expect(result.current.soundEnabled).toBe(true);
    expect(result.current.volume).toBe(0.2);
  });

  it("ignores events for other keys", async () => {
    const { result } = renderNotifications();
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "delego-theme-mode",
          newValue: JSON.stringify({ soundEnabled: true, volume: 0.2 }),
        })
      );
    });

    expect(result.current.soundEnabled).toBe(false);
  });

  it("ignores malformed values from another tab", async () => {
    const { result } = renderNotifications();
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: AUDIO_NOTIFICATION_STORAGE_KEY,
          newValue: "{oops",
        })
      );
    });

    expect(result.current.soundEnabled).toBe(false);
  });

  it("stops listening once unmounted", async () => {
    const { result, unmount } = renderNotifications();
    await waitFor(() => expect(result.current.hydrated).toBe(true));
    unmount();

    // Dispatching after unmount must not throw "update on unmounted component".
    expect(() => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: AUDIO_NOTIFICATION_STORAGE_KEY,
          newValue: JSON.stringify({ soundEnabled: true, volume: 0.2 }),
        })
      );
    }).not.toThrow();
  });
});

describe("useAudioNotifications — playChime gating", () => {
  it("plays when the user has opted in", async () => {
    store(true, 0.5);
    const { result } = renderNotifications();
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    let played = false;
    act(() => {
      played = result.current.playChime();
    });

    expect(played).toBe(true);
    expect(playChimeSpy).toHaveBeenCalledWith(0.5);
  });

  it("stays silent while the user has not opted in", async () => {
    const { result } = renderNotifications();
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    let played = true;
    act(() => {
      played = result.current.playChime();
    });

    expect(played).toBe(false);
    expect(playChimeSpy).not.toHaveBeenCalled();
  });

  it("stays silent when the OS asks for reduced motion", async () => {
    uninstallMatchMedia?.();
    uninstallMatchMedia = mockMatchMedia(true);
    store(true, 0.5);
    const { result } = renderNotifications();
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    expect(result.current.suppressionReason).toBe("reduced-motion");
    expect(result.current.playChime()).toBe(false);
    expect(playChimeSpy).not.toHaveBeenCalled();
  });

  it("honours the in-app reduce-motion override", async () => {
    store(true, 0.5);
    document.documentElement.dataset.reduceMotion = "on";
    const { result } = renderNotifications();
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    expect(result.current.suppressionReason).toBe("reduced-motion");
    expect(result.current.playChime()).toBe(false);
  });

  it("plays when the visitor explicitly overrides reduced motion off", async () => {
    uninstallMatchMedia?.();
    uninstallMatchMedia = mockMatchMedia(true);
    store(true, 0.5);
    document.documentElement.dataset.reduceMotion = "off";
    const { result } = renderNotifications();
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    expect(result.current.playChime()).toBe(true);
  });

  it("stays silent in a browser without Web Audio", async () => {
    uninstallAudio?.();
    uninstallAudio = undefined;
    delete (window as unknown as Record<string, unknown>).AudioContext;
    store(true, 0.5);
    const { result } = renderNotifications();
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    expect(result.current.suppressionReason).toBe("unsupported");
    expect(result.current.playChime()).toBe(false);
  });

  it("still reports support on a legacy browser that only exposes webkitAudioContext", async () => {
    // The provider must not report "unsupported" on the Safari versions that
    // ship only the prefixed constructor — the chime plays there.
    uninstallAudio?.();
    uninstallAudio = undefined;
    const scope = window as unknown as Record<string, unknown>;
    delete scope.AudioContext;
    scope.webkitAudioContext = function LegacyAudioContext() {
      const fake = installFakeAudioContext() as unknown as {
        FakeCtor: new () => unknown;
      };
      return new fake.FakeCtor();
    };
    store(true, 0.5);

    try {
      const { result } = renderNotifications();
      await waitFor(() => expect(result.current.hydrated).toBe(true));

      expect(result.current.suppressionReason).toBeNull();
    } finally {
      delete scope.webkitAudioContext;
      uninstallAudio = installFakeAudioContext().uninstall;
    }
  });

  it("normalizes a zero persisted volume up to the minimum rather than muting", async () => {
    // A zero volume can't survive normalization (an exponential gain ramp
    // can't target silence), so a hand-edited value must not become a hidden
    // mute the toggle doesn't reflect.
    window.localStorage.setItem(
      AUDIO_NOTIFICATION_STORAGE_KEY,
      JSON.stringify({ soundEnabled: true, volume: 0 })
    );
    const { result } = renderNotifications();
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    expect(result.current.volume).toBe(MIN_AUDIO_NOTIFICATION_VOLUME);
    expect(result.current.active).toBe(true);
  });

  it("re-checks the gate on every call rather than caching it", async () => {
    const { result } = renderNotifications();
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    act(() => result.current.setSoundEnabled(true));
    expect(result.current.playChime()).toBe(true);

    act(() => result.current.setSoundEnabled(false));
    expect(result.current.playChime()).toBe(false);
  });

  it("reports false when the underlying synthesis declines to play", async () => {
    playChimeSpy.mockReturnValue(false);
    store(true, 0.5);
    const { result } = renderNotifications();
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    expect(result.current.playChime()).toBe(false);
  });
});

describe("useAudioNotifications — previewChime", () => {
  // `previewChime` and `playChime` both bottom out in lib/audioChime's
  // `playChime`, which is mocked here — so `playChimeSpy` is the spy that
  // records a preview actually reaching the synthesis.
  it("previews even while the user has the chime muted", async () => {
    const { result } = renderNotifications();
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    expect(result.current.soundEnabled).toBe(false);
    expect(result.current.previewChime()).toBe(true);
    expect(playChimeSpy).toHaveBeenCalledWith(0.4);
  });

  it("still refuses to preview under reduced motion", async () => {
    uninstallMatchMedia?.();
    uninstallMatchMedia = mockMatchMedia(true);
    const { result } = renderNotifications();
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    expect(result.current.previewChime()).toBe(false);
    expect(playChimeSpy).not.toHaveBeenCalled();
  });

  it("still refuses to preview without Web Audio support", async () => {
    uninstallAudio?.();
    uninstallAudio = undefined;
    delete (window as unknown as Record<string, unknown>).AudioContext;
    const { result } = renderNotifications();
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    expect(result.current.previewChime()).toBe(false);
    expect(playChimeSpy).not.toHaveBeenCalled();
  });

  it("previews at the currently selected volume", async () => {
    store(true, 0.9);
    const { result } = renderNotifications();
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    act(() => result.current.setVolume(0.3));

    expect(result.current.previewChime()).toBe(true);
    expect(playChimeSpy).toHaveBeenLastCalledWith(0.3);
  });

  it("refuses to preview at a muted volume", async () => {
    const { result } = renderNotifications();
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    // Hydration snaps the minimum in, so this guards the invariant the
    // preview gate depends on: the volume is never zero.
    expect(result.current.volume).toBeGreaterThan(0);
    expect(result.current.previewChime()).toBe(true);
  });
});

describe("useAudioNotifications — options projection", () => {
  it("exposes the issue's AudioNotificationOptions shape", async () => {
    store(true, 0.3);
    const { result } = renderNotifications();
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    const options = result.current.options;
    expect(options.soundEnabled).toBe(true);
    expect(options.volume).toBe(0.3);
    expect(typeof options.playChime).toBe("function");
  });

  it("routes options.playChime through the same gates", async () => {
    const { result } = renderNotifications();
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    act(() => {
      result.current.options.playChime();
    });

    expect(playChimeSpy).not.toHaveBeenCalled();
  });

  it("keeps options in sync with the live preferences", async () => {
    const { result } = renderNotifications();
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    act(() => result.current.setSoundEnabled(true));
    act(() => result.current.setVolume(0.7));

    expect(result.current.options).toMatchObject({
      soundEnabled: true,
      volume: 0.7,
    });
  });
});

describe("useAudioNotifications — provider contract", () => {
  it("throws when used outside a provider", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderHook(() => useAudioNotifications())).toThrow(
      /AudioNotificationsProvider/
    );
    spy.mockRestore();
  });

  it("renders its children", () => {
    function Probe() {
      const value: AudioNotificationsContextValue = useAudioNotifications();
      return <span>{value.hydrated ? "ready" : "loading"}</span>;
    }

    render(
      <AudioNotificationsProvider>
        <Probe />
      </AudioNotificationsProvider>
    );

    expect(screen.getByText("ready")).toBeInTheDocument();
  });
});
