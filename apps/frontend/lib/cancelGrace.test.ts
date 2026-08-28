import { describe, it, expect } from "vitest";
import {
  computeClockSkewMs,
  getGraceRemainingMs,
  isGraceExpired,
  reconcileGraceState,
} from "./cancelGrace";
import type { CancellationGrace } from "@delegolabs/types";

function makeGrace(overrides: Partial<CancellationGrace> = {}): CancellationGrace {
  return {
    requestedAt: "2026-01-01T00:00:00.000Z",
    gracePeriodSeconds: 60,
    graceExpiresAt: "2026-01-01T00:01:00.000Z",
    serverTimestamp: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("computeClockSkewMs", () => {
  it("is zero when the client clock exactly matches the server", () => {
    const skew = computeClockSkewMs(
      "2026-01-01T00:00:00.000Z",
      new Date("2026-01-01T00:00:00.000Z")
    );
    expect(skew).toBe(0);
  });

  it("is positive when the client clock runs ahead of the server", () => {
    const skew = computeClockSkewMs(
      "2026-01-01T00:00:00.000Z",
      new Date("2026-01-01T00:00:10.000Z") // client says 10s later than server
    );
    expect(skew).toBe(10_000);
  });

  it("is negative when the client clock runs behind the server", () => {
    const skew = computeClockSkewMs(
      "2026-01-01T00:00:10.000Z",
      new Date("2026-01-01T00:00:00.000Z")
    );
    expect(skew).toBe(-10_000);
  });
});

describe("getGraceRemainingMs", () => {
  it("counts down from the server-issued expiry when clocks agree", () => {
    const grace = makeGrace();
    const remaining = getGraceRemainingMs(
      grace,
      new Date("2026-01-01T00:00:30.000Z"),
      0
    );
    expect(remaining).toBe(30_000);
  });

  it("neutralizes a client clock that runs fast (skew would otherwise shorten the window)", () => {
    // Client clock is 20s ahead of the server. Received at server-time
    // 00:00:00 (client read 00:00:20), skew = +20s.
    const skewMs = computeClockSkewMs(
      "2026-01-01T00:00:00.000Z",
      new Date("2026-01-01T00:00:20.000Z")
    );
    const grace = makeGrace(); // expires at server time 00:01:00
    // The client's raw clock now reads 00:00:50 (only 10s of *real* time has
    // passed since receipt, but its fast clock shows 30s elapsed). Without
    // skew correction this would read as 10s remaining; corrected, 30s of
    // real server time have elapsed, leaving 30s.
    const clientNow = new Date("2026-01-01T00:00:50.000Z");
    expect(getGraceRemainingMs(grace, clientNow, skewMs)).toBe(30_000);
  });

  it("neutralizes a client clock that runs slow", () => {
    const skewMs = computeClockSkewMs(
      "2026-01-01T00:00:00.000Z",
      new Date("2026-01-01T23:59:40.000Z") // client 20s behind (previous day repr for delta)
    );
    // Simplify: skew here is effectively a large negative number reflecting
    // "client behind"; just assert the corrected math is self-consistent by
    // re-deriving with a clean example instead of date-wrap arithmetic.
    const cleanSkewMs = computeClockSkewMs(
      "2026-01-01T00:00:20.000Z",
      new Date("2026-01-01T00:00:00.000Z")
    ); // client reads 20s behind -> skew = -20_000
    expect(cleanSkewMs).toBe(-20_000);
    const grace = makeGrace({
      serverTimestamp: "2026-01-01T00:00:20.000Z",
      graceExpiresAt: "2026-01-01T00:01:20.000Z",
    });
    // Real server time has advanced 30s since receipt; client's slow clock
    // only shows 10s elapsed (00:00:10). Corrected now = 00:00:10 - (-20s) = 00:00:30.
    const remaining = getGraceRemainingMs(grace, new Date("2026-01-01T00:00:10.000Z"), cleanSkewMs);
    expect(remaining).toBe(50_000); // 00:01:20 - 00:00:30 = 50s
    void skewMs;
  });

  it("floors at zero once the window has elapsed, never going negative", () => {
    const grace = makeGrace();
    const remaining = getGraceRemainingMs(
      grace,
      new Date("2026-01-01T00:05:00.000Z"),
      0
    );
    expect(remaining).toBe(0);
  });
});

describe("isGraceExpired", () => {
  it("is false while time remains", () => {
    const grace = makeGrace();
    expect(isGraceExpired(grace, new Date("2026-01-01T00:00:30.000Z"), 0)).toBe(false);
  });

  it("is true once the deadline has passed", () => {
    const grace = makeGrace();
    expect(isGraceExpired(grace, new Date("2026-01-01T00:01:00.001Z"), 0)).toBe(true);
  });

  it("is true exactly at the deadline", () => {
    const grace = makeGrace();
    expect(isGraceExpired(grace, new Date("2026-01-01T00:01:00.000Z"), 0)).toBe(true);
  });
});

describe("reconcileGraceState", () => {
  it("keeps cancelling while the server still reports an active grace window", () => {
    expect(reconcileGraceState("cancelling", makeGrace())).toBe("keep_cancelling");
  });

  it("restores when the server has cleared the cancellation and the escrow isn't cancelled", () => {
    expect(reconcileGraceState("funded", null)).toBe("restore");
    expect(reconcileGraceState("funded", undefined)).toBe("restore");
  });

  it("finalizes when the undo lost the race against server-side expiration", () => {
    // Undo was sent, but by the time it landed the server had already
    // finalized the cancellation — no active grace window, status cancelled.
    expect(reconcileGraceState("cancelled", null)).toBe("finalize");
  });
});
