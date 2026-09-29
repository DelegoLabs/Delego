import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { AutoReleaseGraceBanner } from "./AutoReleaseGraceBanner";

const START = new Date("2026-01-01T00:00:00.000Z");

function expiresIn(ms: number): string {
  return new Date(START.getTime() + ms).toISOString();
}

describe("AutoReleaseGraceBanner", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(START);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows the order and a seconds-resolution countdown", () => {
    render(
      <AutoReleaseGraceBanner
        graceExpiresAt={expiresIn(8 * 3600 * 1000)}
        onPauseRelease={vi.fn()}
        orderId="order-77"
      />
    );

    expect(screen.getByTestId("auto-release-grace-banner")).toBeInTheDocument();
    expect(screen.getByText(/order-77/i)).toBeInTheDocument();
    expect(screen.getByTestId("auto-release-grace-countdown")).toHaveTextContent("8:00:00");
  });

  it("ticks down once per second", () => {
    render(
      <AutoReleaseGraceBanner
        graceExpiresAt={expiresIn(8 * 3600 * 1000)}
        onPauseRelease={vi.fn()}
        orderId="order-77"
      />
    );

    act(() => {
      vi.advanceTimersByTime(1_000);
    });

    expect(screen.getByTestId("auto-release-grace-countdown")).toHaveTextContent("7:59:59");
  });

  it("pauses the release and dismisses the banner on success", async () => {
    const onPauseRelease = vi.fn().mockResolvedValue(undefined);

    render(
      <AutoReleaseGraceBanner
        graceExpiresAt={expiresIn(8 * 3600 * 1000)}
        onPauseRelease={onPauseRelease}
        orderId="order-77"
      />
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /pause & dispute/i }));
    });

    expect(onPauseRelease).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("auto-release-grace-banner")).toBeNull();
  });

  it("stays visible and surfaces the error when pausing fails", async () => {
    const onPauseRelease = vi.fn().mockRejectedValue(new Error("Pause rejected"));

    render(
      <AutoReleaseGraceBanner
        graceExpiresAt={expiresIn(8 * 3600 * 1000)}
        onPauseRelease={onPauseRelease}
        orderId="order-77"
      />
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /pause & dispute/i }));
    });

    expect(screen.getByTestId("auto-release-grace-banner")).toBeInTheDocument();
    expect(screen.getByText("Pause rejected")).toBeInTheDocument();
  });

  it("auto-dismisses when the grace period expires", () => {
    render(
      <AutoReleaseGraceBanner
        graceExpiresAt={expiresIn(3_000)}
        onPauseRelease={vi.fn()}
        orderId="order-77"
      />
    );

    expect(screen.getByTestId("auto-release-grace-banner")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(3_000);
    });

    expect(screen.queryByTestId("auto-release-grace-banner")).toBeNull();
  });
});
