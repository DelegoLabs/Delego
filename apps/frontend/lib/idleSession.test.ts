import { describe, it, expect } from "vitest";
import {
  DEFAULT_IDLE_TIMEOUT_MINUTES,
  DEFAULT_IDLE_WARNING_SECONDS,
  resolveIdleSessionConfig,
} from "./idleSession";

describe("resolveIdleSessionConfig", () => {
  it("is disabled by default in development", () => {
    const config = resolveIdleSessionConfig({}, "development");
    expect(config.enabled).toBe(false);
  });

  it("opts in during development when the flag is truthy", () => {
    for (const flag of ["true", "1", "on", "ON"]) {
      expect(
        resolveIdleSessionConfig(
          { NEXT_PUBLIC_IDLE_SESSION_ENABLED: flag },
          "development"
        ).enabled
      ).toBe(true);
    }
  });

  it("is enabled by default in production", () => {
    expect(resolveIdleSessionConfig({}, "production").enabled).toBe(true);
  });

  it("treats every non-production NODE_ENV as dev (off by default)", () => {
    expect(resolveIdleSessionConfig({}, "test").enabled).toBe(false);
    expect(resolveIdleSessionConfig({}, undefined).enabled).toBe(false);
  });

  it("opts out in production when the flag is explicitly falsy", () => {
    for (const flag of ["false", "0", "off"]) {
      expect(
        resolveIdleSessionConfig(
          { NEXT_PUBLIC_IDLE_SESSION_ENABLED: flag },
          "production"
        ).enabled
      ).toBe(false);
    }
  });

  it("falls back to the default timeout and warning window", () => {
    const config = resolveIdleSessionConfig({}, "production");
    const expectedCountdownMs = DEFAULT_IDLE_WARNING_SECONDS * 1_000;
    expect(config.countdownMs).toBe(expectedCountdownMs);
    expect(config.warnAfterMs).toBe(
      DEFAULT_IDLE_TIMEOUT_MINUTES * 60_000 - expectedCountdownMs
    );
  });

  it("honours a configured timeout and warning window", () => {
    const config = resolveIdleSessionConfig(
      {
        NEXT_PUBLIC_IDLE_TIMEOUT_MINUTES: "10",
        NEXT_PUBLIC_IDLE_WARNING_SECONDS: "30",
      },
      "production"
    );
    expect(config.countdownMs).toBe(30_000);
    expect(config.warnAfterMs).toBe(10 * 60_000 - 30_000);
  });

  it("ignores non-numeric or non-positive overrides", () => {
    const config = resolveIdleSessionConfig(
      {
        NEXT_PUBLIC_IDLE_TIMEOUT_MINUTES: "not-a-number",
        NEXT_PUBLIC_IDLE_WARNING_SECONDS: "-5",
      },
      "production"
    );
    expect(config.countdownMs).toBe(DEFAULT_IDLE_WARNING_SECONDS * 1_000);
    expect(config.warnAfterMs).toBe(
      DEFAULT_IDLE_TIMEOUT_MINUTES * 60_000 -
        DEFAULT_IDLE_WARNING_SECONDS * 1_000
    );
  });

  it("clamps a warning window longer than the timeout to half the window", () => {
    const config = resolveIdleSessionConfig(
      {
        NEXT_PUBLIC_IDLE_TIMEOUT_MINUTES: "1",
        NEXT_PUBLIC_IDLE_WARNING_SECONDS: "600",
      },
      "production"
    );
    expect(config.countdownMs).toBe(30_000);
    expect(config.warnAfterMs).toBe(30_000);
  });
});
