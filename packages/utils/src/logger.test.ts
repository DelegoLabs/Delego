import { describe, it, expect, vi, beforeEach } from "vitest";
import { createLogger } from "./logger.js";

describe("createLogger", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("should log at info level by default", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const logger = createLogger("test-service");

    logger.info("hello");

    expect(spy).toHaveBeenCalledTimes(1);
    const entry = JSON.parse(spy.mock.calls[0][0]);
    expect(entry).toMatchObject({
      level: "info",
      service: "test-service",
      message: "hello",
    });
    expect(entry.timestamp).toBeDefined();
  });

  it("should include meta fields in the output", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const logger = createLogger("svc");

    logger.info("done", { userId: "abc", durationMs: 42 });

    const entry = JSON.parse(spy.mock.calls[0][0]);
    expect(entry.userId).toBe("abc");
    expect(entry.durationMs).toBe(42);
  });

  it("should suppress messages below the configured level", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const logger = createLogger("svc", "warn");

    logger.debug("debug message");
    logger.info("info message");
    logger.warn("warn message");

    expect(spy).toHaveBeenCalledTimes(1);
    const entry = JSON.parse(spy.mock.calls[0][0]);
    expect(entry.level).toBe("warn");
  });

  it("should log at all levels", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const logger = createLogger("svc", "debug");

    logger.debug("d"); logger.info("i"); logger.warn("w"); logger.error("e");

    expect(spy).toHaveBeenCalledTimes(4);
  });
});