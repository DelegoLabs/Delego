import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IdleTimeoutGuard, IdleTimeoutModal } from "../components/IdleTimeoutModal";
import { purgeSensitiveSessionState } from "../lib/sessionPurge";
import { IDLE_ACTIVITY_EVENTS, useIdleTimer } from "./useIdleTimer";
import { syncWalletDisconnected } from "./useWallet";

vi.mock("../lib/sessionPurge", () => ({
  purgeSensitiveSessionState: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("./useWallet", () => ({ syncWalletDisconnected: vi.fn() }));

const MINUTE = 60_000;

function setup(warning = 15, logout = 20) {
  const onWarning = vi.fn();
  const onLogout = vi.fn();
  const hook = renderHook(() =>
    useIdleTimer({
      warningTimeoutMinutes: warning,
      logoutTimeoutMinutes: logout,
      onWarning,
      onLogout,
    })
  );
  return { ...hook, onWarning, onLogout };
}

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("useIdleTimer", () => {
  it("warns at the warning threshold and logs out at the logout threshold", () => {
    const { result, onWarning, onLogout } = setup();

    advance(15 * MINUTE - 1_000);
    expect(onWarning).not.toHaveBeenCalled();
    expect(result.current.isWarning).toBe(false);

    advance(1_000);
    expect(onWarning).toHaveBeenCalledTimes(1);
    expect(result.current.isWarning).toBe(true);
    expect(result.current.secondsRemaining).toBe(300);

    advance(5 * MINUTE);
    expect(onLogout).toHaveBeenCalledTimes(1);
    expect(result.current.isWarning).toBe(false);

    advance(10 * MINUTE);
    expect(onLogout).toHaveBeenCalledTimes(1);
  });

  it.each(IDLE_ACTIVITY_EVENTS)("resets the idle clock on %s", (eventName) => {
    const { onWarning } = setup();

    advance(14 * MINUTE);
    act(() => {
      window.dispatchEvent(new Event(eventName));
    });
    advance(14 * MINUTE);
    expect(onWarning).not.toHaveBeenCalled();

    advance(1 * MINUTE + 1_000);
    expect(onWarning).toHaveBeenCalledTimes(1);
  });

  it("ignores passive activity once the warning is showing", () => {
    const { result, onLogout } = setup(19, 20);

    advance(19 * MINUTE);
    expect(result.current.isWarning).toBe(true);
    act(() => {
      window.dispatchEvent(new Event("mousemove"));
    });
    advance(1 * MINUTE);
    expect(onLogout).toHaveBeenCalledTimes(1);
  });

  it("resetTimer dismisses the warning and restarts the countdown", () => {
    const { result, onLogout, onWarning } = setup(19, 20);

    advance(19 * MINUTE + 30_000);
    expect(result.current.secondsRemaining).toBe(30);

    act(() => result.current.resetTimer());
    expect(result.current.isWarning).toBe(false);

    advance(19 * MINUTE - 1_000);
    expect(onLogout).not.toHaveBeenCalled();
    expect(onWarning).toHaveBeenCalledTimes(1);

    advance(1_000);
    expect(onWarning).toHaveBeenCalledTimes(2);
  });

  it("does nothing while disabled", () => {
    const onLogout = vi.fn();
    renderHook(() =>
      useIdleTimer({
        warningTimeoutMinutes: 1,
        logoutTimeoutMinutes: 2,
        onWarning: vi.fn(),
        onLogout,
        enabled: false,
      })
    );
    advance(10 * MINUTE);
    expect(onLogout).not.toHaveBeenCalled();
  });
});

describe("IdleTimeoutModal", () => {
  it("shows the countdown and both actions", () => {
    const onStay = vi.fn();
    const onLogoutNow = vi.fn();
    render(
      <IdleTimeoutModal open secondsRemaining={60} onStay={onStay} onLogoutNow={onLogoutNow} />
    );
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(screen.getByText(/60 seconds/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /stay signed in/i }));
    fireEvent.click(screen.getByRole("button", { name: /sign out now/i }));
    expect(onStay).toHaveBeenCalledTimes(1);
    expect(onLogoutNow).toHaveBeenCalledTimes(1);
  });
});

describe("IdleTimeoutGuard", () => {
  it("shows a 60-second warning, then purges state and redirects to login", async () => {
    const redirect = vi.fn();
    render(<IdleTimeoutGuard redirect={redirect} />);

    advance(19 * MINUTE);
    expect(screen.getByText(/60 seconds/)).toBeInTheDocument();

    advance(1 * MINUTE);
    // Let the async purge -> redirect chain settle.
    await act(async () => {
      for (let i = 0; i < 5; i += 1) await Promise.resolve();
    });

    expect(syncWalletDisconnected).toHaveBeenCalledTimes(1);
    expect(purgeSensitiveSessionState).toHaveBeenCalledTimes(1);
    expect(redirect).toHaveBeenCalledWith(expect.stringMatching(/^\/login\?next=/));
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
});
