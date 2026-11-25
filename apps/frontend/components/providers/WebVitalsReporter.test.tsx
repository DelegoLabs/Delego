import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useReportWebVitals } from "next/web-vitals";
import * as Sentry from "@sentry/nextjs";
import { WebVitalsReporter } from "./WebVitalsReporter";

vi.mock("next/web-vitals", () => ({ useReportWebVitals: vi.fn() }));
vi.mock("@sentry/nextjs", () => ({ setMeasurement: vi.fn() }));

type Metric = Parameters<Parameters<typeof useReportWebVitals>[0]>[0];
const metric = {
  name: "LCP",
  value: 1250,
  delta: 1250,
  id: "test-vital",
  rating: "good",
  navigationType: "navigate",
  entries: [],
} as Metric;

function report(value = metric) {
  const { container } = render(<WebVitalsReporter />);
  expect(container).toBeEmptyDOMElement();
  const callback = vi.mocked(useReportWebVitals).mock.calls.at(-1)![0];
  callback(value);
}

describe("WebVitalsReporter", () => {
  const sendBeacon = vi.fn(() => true);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.stubEnv(
      "NEXT_PUBLIC_WEB_VITALS_ENDPOINT",
      "https://metrics.example.com/vitals"
    );
    vi.stubGlobal("navigator", { sendBeacon });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("logs only in development without sending telemetry", () => {
    vi.stubEnv("NODE_ENV", "development");
    report();
    expect(console.log).toHaveBeenCalledWith("[web-vitals] LCP", 1250, metric);
    expect(Sentry.setMeasurement).not.toHaveBeenCalled();
    expect(sendBeacon).not.toHaveBeenCalled();
  });

  it("does not log or send telemetry in test", () => {
    vi.stubEnv("NODE_ENV", "test");
    report();
    expect(console.log).not.toHaveBeenCalled();
    expect(Sentry.setMeasurement).not.toHaveBeenCalled();
    expect(sendBeacon).not.toHaveBeenCalled();
  });

  it.each(["LCP", "INP", "FCP", "TTFB", "CLS"] as const)(
    "reports production %s with the correct unit and beacon payload without logging",
    (name) => {
      vi.stubEnv("NODE_ENV", "production");
      const value = name === "CLS" ? 0.05 : 1250;
      report({ ...metric, name, value } as Metric);
      expect(console.log).not.toHaveBeenCalled();
      expect(Sentry.setMeasurement).toHaveBeenCalledWith(
        name,
        value,
        name === "CLS" ? "" : "millisecond"
      );
      expect(sendBeacon).toHaveBeenCalledWith(
        "https://metrics.example.com/vitals",
        JSON.stringify({
          name,
          value,
          id: metric.id,
          rating: metric.rating,
          navigationType: metric.navigationType,
          path: window.location.pathname,
        })
      );
    }
  );

  it("still reports to Sentry when the endpoint is not configured", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_WEB_VITALS_ENDPOINT", undefined);
    report();
    expect(Sentry.setMeasurement).toHaveBeenCalledOnce();
    expect(sendBeacon).not.toHaveBeenCalled();
  });

  it("still reports to Sentry when sendBeacon is unavailable", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubGlobal("navigator", {});
    expect(() => report()).not.toThrow();
    expect(Sentry.setMeasurement).toHaveBeenCalledOnce();
    expect(sendBeacon).not.toHaveBeenCalled();
  });
});
