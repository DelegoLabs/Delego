import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

import { usePwaInstall } from "./usePwaInstall";

const DISMISSED_STORAGE_KEY = "delego-install-dismissed";

interface FakePromptEvent extends Event {
  prompt: ReturnType<typeof vi.fn>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/** Dispatches a `beforeinstallprompt` carrying a controllable prompt(). */
function dispatchInstallPrompt(outcome: "accepted" | "dismissed" = "accepted") {
  const event = new Event("beforeinstallprompt", { cancelable: true }) as FakePromptEvent;
  event.prompt = vi.fn().mockResolvedValue(undefined);
  event.userChoice = Promise.resolve({ outcome });
  window.dispatchEvent(event);
  return event;
}

beforeEach(() => {
  window.localStorage.clear();
});

describe("usePwaInstall", () => {
  it("is not installable until the browser offers the event", () => {
    const { result } = renderHook(() => usePwaInstall());
    expect(result.current.canInstall).toBe(false);
  });

  it("becomes installable once beforeinstallprompt fires", async () => {
    const { result } = renderHook(() => usePwaInstall());

    await act(async () => {
      dispatchInstallPrompt();
    });

    await waitFor(() => expect(result.current.canInstall).toBe(true));
  });

  it("prevents the browser's default prompt so the in-app card owns the flow", async () => {
    renderHook(() => usePwaInstall());

    let event: FakePromptEvent | undefined;
    await act(async () => {
      event = dispatchInstallPrompt();
    });

    expect(event?.defaultPrevented).toBe(true);
  });

  it("resolves true when the user accepts the native prompt", async () => {
    const { result } = renderHook(() => usePwaInstall());

    await act(async () => {
      dispatchInstallPrompt("accepted");
    });
    await waitFor(() => expect(result.current.canInstall).toBe(true));

    let accepted: boolean | undefined;
    await act(async () => {
      accepted = await result.current.promptInstall();
    });

    expect(accepted).toBe(true);
  });

  it("resolves false when the user dismisses the native prompt", async () => {
    const { result } = renderHook(() => usePwaInstall());

    await act(async () => {
      dispatchInstallPrompt("dismissed");
    });
    await waitFor(() => expect(result.current.canInstall).toBe(true));

    let accepted: boolean | undefined;
    await act(async () => {
      accepted = await result.current.promptInstall();
    });

    expect(accepted).toBe(false);
  });

  it("returns false when prompting with no deferred event", async () => {
    const { result } = renderHook(() => usePwaInstall());

    let accepted: boolean | undefined;
    await act(async () => {
      accepted = await result.current.promptInstall();
    });

    expect(accepted).toBe(false);
  });

  it("hides the card and remembers the dismissal", async () => {
    const { result } = renderHook(() => usePwaInstall());

    await act(async () => {
      dispatchInstallPrompt();
    });
    await waitFor(() => expect(result.current.canInstall).toBe(true));

    act(() => {
      result.current.dismiss();
    });

    expect(result.current.canInstall).toBe(false);
    expect(window.localStorage.getItem(DISMISSED_STORAGE_KEY)).toBe("1");
  });

  it("stays hidden when the user dismissed on a previous visit", async () => {
    window.localStorage.setItem(DISMISSED_STORAGE_KEY, "1");

    const { result } = renderHook(() => usePwaInstall());

    await act(async () => {
      dispatchInstallPrompt();
    });

    expect(result.current.canInstall).toBe(false);
  });

  it("stops offering install once the app is already installed", async () => {
    const { result } = renderHook(() => usePwaInstall());

    await act(async () => {
      dispatchInstallPrompt();
    });
    await waitFor(() => expect(result.current.canInstall).toBe(true));

    await act(async () => {
      window.dispatchEvent(new Event("appinstalled"));
    });

    expect(result.current.canInstall).toBe(false);
  });

  it("removes its window listeners on unmount", async () => {
    const removeSpy = vi.spyOn(window, "removeEventListener");
    const { unmount } = renderHook(() => usePwaInstall());

    unmount();

    const events = removeSpy.mock.calls.map(([type]) => type);
    expect(events).toContain("beforeinstallprompt");
    expect(events).toContain("appinstalled");
  });
});