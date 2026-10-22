"use client";

import { useReportWebVitals } from "next/web-vitals";

/**
 * Reports Core Web Vitals (LCP, CLS, INP, FCP, TTFB) for #512. In dev, metrics
 * are logged to the console for a fast feedback loop; in prod they're sent as
 * Sentry measurements (reusing the Sentry transport already wired for #511)
 * and, if configured, POSTed to NEXT_PUBLIC_WEB_VITALS_ENDPOINT as a
 * `navigator.sendBeacon` payload so the report survives page unload.
 *
 * See docs/architecture/frontend-perf.md for the performance budget these
 * numbers are measured against.
 */
export function WebVitalsReporter() {
  useReportWebVitals((metric) => {
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console -- intentional dev-only vitals feedback
      console.log(`[web-vitals] ${metric.name}`, metric.value, metric);
      return;
    }

    if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
      void import("@sentry/nextjs")
        .then((Sentry) => {
          Sentry.setMeasurement(
            metric.name,
            metric.value,
            metric.name === "CLS" ? "" : "millisecond"
          );
        })
        .catch((error: unknown) => {
          console.error("Failed to report web vitals to Sentry.", error);
        });
    }

    const endpoint = process.env.NEXT_PUBLIC_WEB_VITALS_ENDPOINT;
    if (endpoint && typeof navigator.sendBeacon === "function") {
      const body = JSON.stringify({
        name: metric.name,
        value: metric.value,
        id: metric.id,
        rating: metric.rating,
        navigationType: metric.navigationType,
        path: window.location.pathname,
      });
      navigator.sendBeacon(endpoint, body);
    }
  });

  return null;
}
