import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useServiceWorkerUpdate } from "./useServiceWorkerUpdate";
import { SW_UPDATE_DEFERRED_AT_KEY, SW_UPDATE_MAX_DEFERRAL_MS } from "../lib/swUpdate";

vi.mock("next/navigation", () => ({
  usePathname: () => "/delegations",
}));

function mockWorker(state: ServiceWorkerState): ServiceWorker {
  const listeners = new Map<string, Array<() => void>>();
  return {
    state,
    postMessage: vi.fn(),
    addEventListener: (type: string, listener: () => void) => {
      const list = listeners.get(type) ?? [];
      list.push(listener);
      listeners.set(type, list);
    },
    removeEventListener: vi.fn(),
    dispatch: (type: string) => {
      for (const listener of listeners.get(type) ?? []) listener();
    },
  } as unknown as ServiceWorker;
}

describe("useServiceWorkerUpdate (#626)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [
          {
            id: "a1",
            version: "v1",
            message: "New: dispute filing is now live.",
            changelog: "Dispute filing is now live for escrowed orders.",
            severity: "info",
          },
        ],
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("surfaces a waiting worker and clears waiting on activated", async () => {
    const waiting = mockWorker("installed");
    const registration = {
      waiting,
      installing: null,
      addEventListener: vi.fn(),
    } as unknown as ServiceWorkerRegistration;

    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: { controller: {}, addEventListener: vi.fn() },
    });

    const { result } = renderHook(() =>
      useServiceWorkerUpdate({ registration })
    );

    await waitFor(() => expect(result.current.waiting).toBe(true));
    expect(result.current.copy.title).toMatch(/New version ready/i);

    act(() => {
      (waiting as unknown as { state: string }).state = "activated";
      (waiting as unknown as { dispatch: (t: string) => void }).dispatch(
        "statechange"
      );
    });

    await waitFor(() => expect(result.current.waiting).toBe(false));
  });

  it("does not auto-apply while a dialog is open, even when the deferral expired", async () => {
    const waiting = mockWorker("installed");
    const registration = {
      waiting,
      installing: null,
      addEventListener: vi.fn(),
    } as unknown as ServiceWorkerRegistration;
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: { controller: {}, addEventListener: vi.fn() },
    });

    window.localStorage.setItem(
      SW_UPDATE_DEFERRED_AT_KEY,
      String(Date.now() - SW_UPDATE_MAX_DEFERRAL_MS - 1)
    );

    const overlay = document.createElement("div");
    overlay.innerHTML = `<div role="dialog">open</div>`;

    const reload = vi.fn();
    vi.stubGlobal("location", { reload });

    renderHook(() =>
      useServiceWorkerUpdate({
        registration,
        documentRoot: overlay,
        now: () => Date.now(),
      })
    );

    await waitFor(() => expect(waiting.postMessage).not.toHaveBeenCalled());
  });
});
