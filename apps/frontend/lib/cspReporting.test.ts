import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const API_URL = "https://api.example.com";

function makeViolationEvent() {
  const event = new Event("securitypolicyviolation");
  Object.defineProperties(event, {
    blockedURI: { value: "https://blocked.example/resource.js" },
    violatedDirective: { value: "script-src-elem" },
    originalPolicy: { value: "default-src 'self'; script-src 'self'" },
    documentURI: { value: "https://app.example.com/page" },
  });
  return event as SecurityPolicyViolationEvent;
}

async function initializeReporting() {
  const { initCspViolationReporting } = await import("./cspReporting");
  return initCspViolationReporting();
}

describe("CSP violation reporting", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    );
    fetchMock = vi.mocked(fetch);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("maps browser event properties to the JSON report and sends it to the endpoint", async () => {
    const cleanup = await initializeReporting();
    const now = new Date("2026-10-21T14:00:00.000Z");
    vi.setSystemTime(now);

    window.dispatchEvent(makeViolationEvent());
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    expect(fetchMock).toHaveBeenCalledWith(
      `${API_URL}/api/v1/telemetry/csp`,
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "omit",
      })
    );
    const [, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    const report = JSON.parse(request.body as string);
    expect(report).toEqual({
      blockedUri: "https://blocked.example/resource.js",
      violatedDirective: "script-src-elem",
      originalPolicy: "default-src 'self'; script-src 'self'",
      documentUri: "https://app.example.com/page",
      timestamp: now.toISOString(),
    });
    expect(Number.isNaN(Date.parse(report.timestamp))).toBe(false);
    cleanup();
  });

  it("dispatches at most five reports in a rolling 60-second window", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-21T14:00:00.000Z"));
    const cleanup = await initializeReporting();

    for (let index = 0; index < 6; index += 1)
      window.dispatchEvent(makeViolationEvent());
    expect(fetchMock).toHaveBeenCalledTimes(5);

    vi.setSystemTime(new Date("2026-10-21T14:00:59.999Z"));
    window.dispatchEvent(makeViolationEvent());
    expect(fetchMock).toHaveBeenCalledTimes(5);

    vi.setSystemTime(new Date("2026-10-21T14:01:00.000Z"));
    window.dispatchEvent(makeViolationEvent());
    expect(fetchMock).toHaveBeenCalledTimes(6);
    cleanup();
  });

  it("counts failed requests against the rate limit and suppresses request failures", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-21T14:00:00.000Z"));
    fetchMock.mockRejectedValue(new Error("network failure"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const cleanup = await initializeReporting();

    for (let index = 0; index < 6; index += 1)
      window.dispatchEvent(makeViolationEvent());
    await vi.waitFor(() => expect(warn).toHaveBeenCalledTimes(5));

    expect(fetchMock).toHaveBeenCalledTimes(5);
    cleanup();
  });

  it("handles unsuccessful HTTP responses without retrying", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 500 }));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const cleanup = await initializeReporting();

    window.dispatchEvent(makeViolationEvent());
    await vi.waitFor(() =>
      expect(warn).toHaveBeenCalledWith(
        "CSP violation telemetry request failed with status",
        500
      )
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it("reuses one listener for repeated initialization and removes it after cleanup", async () => {
    const addListener = vi.spyOn(window, "addEventListener");
    const removeListener = vi.spyOn(window, "removeEventListener");
    const cleanupOne = await initializeReporting();
    const cleanupTwo = await initializeReporting();

    expect(
      addListener.mock.calls.filter(
        ([type]) => type === "securitypolicyviolation"
      )
    ).toHaveLength(1);

    cleanupOne();
    window.dispatchEvent(makeViolationEvent());
    expect(fetchMock).toHaveBeenCalledTimes(1);

    cleanupTwo();
    window.dispatchEvent(makeViolationEvent());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(
      removeListener.mock.calls.filter(
        ([type]) => type === "securitypolicyviolation"
      )
    ).toHaveLength(1);
  });

  it("does not throw when initialized without a browser window", async () => {
    const originalWindow = globalThis.window;
    vi.stubGlobal("window", undefined);

    const cleanup = await initializeReporting();
    expect(cleanup).not.toThrow();

    vi.stubGlobal("window", originalWindow);
  });
});
