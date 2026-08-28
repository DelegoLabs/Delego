import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useIdleSession } from "./useIdleSession";
import type { IdleSessionConfig } from "../lib/idleSession";

const CONFIG: IdleSessionConfig = {
  enabled: true,
  warnAfterMs: 10_000,
  countdownMs: 5_000,
};

function setup(
  overrides: Partial<Parameters<typeof useIdleSession>[0]> = {}
) {
  const onExpire = vi.fn();
  const ping = vi.fn().mockResolvedValue(true);
  const view = renderHook(() =>
    useIdleSession({ config: CONFIG, onExpire, ping, ...overrides })
  );
  return { onExpire, ping, ...view };
}

/** Fire a throttled activity event and let the 1s throttle window pass. */
function activity() {
  act(() => {
    window.dispatchEvent(new Event("pointermove"));
    vi.advanceTimersByTime(1_100);
  });
}

describe("useIdleSession", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does nothing when disabled by config", () => {
    const { result, onExpire } = setup({
      config: { ...CONFIG, enabled: false },
    });
    act(() => vi.advanceTimersByTime(60_000));
    expect(result.current.warning).toBe(false);
    expect(onExpire).not.toHaveBeenCalled();
  });

  it("shows the warning after the idle period with the countdown seeded", () => {
    const { result } = setup();
    expect(result.current.warning).toBe(false);
    act(() => vi.advanceTimersByTime(CONFIG.warnAfterMs));
    expect(result.current.warning).toBe(true);
    expect(result.current.secondsLeft).toBe(5);
  });

  it("keeps resetting the idle timer while the user is active", () => {
    const { result } = setup();
    for (let i = 0; i < 20; i += 1) {
      activity();
    }
    // 20 * 1.1s = 22s of wall time, but never 10s idle in a row.
    expect(result.current.warning).toBe(false);
  });

  it("counts down and expires to /login?next= when ignored", () => {
    const { result, onExpire } = setup();
    act(() => vi.advanceTimersByTime(CONFIG.warnAfterMs));
    expect(result.current.secondsLeft).toBe(5);
    act(() => vi.advanceTimersByTime(2_000));
    expect(result.current.secondsLeft).toBe(3);
    act(() => vi.advanceTimersByTime(3_000));
    expect(onExpire).toHaveBeenCalledTimes(1);
    expect(onExpire.mock.calls[0][0]).toMatch(/^\/login\?next=/);
  });

  it("refreshes and resumes watching when the user confirms and the ping succeeds", async () => {
    const { result, ping, onExpire } = setup();
    act(() => vi.advanceTimersByTime(CONFIG.warnAfterMs));
    expect(result.current.warning).toBe(true);

    await act(async () => {
      result.current.stayActive();
    });

    expect(ping).toHaveBeenCalledTimes(1);
    expect(result.current.warning).toBe(false);
    expect(onExpire).not.toHaveBeenCalled();

    // Watching resumed: going idle again re-triggers the warning.
    act(() => vi.advanceTimersByTime(CONFIG.warnAfterMs));
    expect(result.current.warning).toBe(true);
  });

  it("expires when the confirm ping reports the session is already gone", async () => {
    const ping = vi.fn().mockResolvedValue(false);
    const { result, onExpire } = setup({ ping });
    act(() => vi.advanceTimersByTime(CONFIG.warnAfterMs));

    await act(async () => {
      result.current.stayActive();
    });

    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it("ignores activity events once the warning is showing", () => {
    const { result, onExpire } = setup();
    act(() => vi.advanceTimersByTime(CONFIG.warnAfterMs));
    activity();
    expect(result.current.warning).toBe(true);
    act(() => vi.advanceTimersByTime(CONFIG.countdownMs));
    expect(onExpire).toHaveBeenCalledTimes(1);
  });
});
