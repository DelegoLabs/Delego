import * as Sentry from "@sentry/nextjs";
import { scrubSentryEvent } from "./lib/observability/scrub-sentry";

/**
 * Browser-side Sentry init (#511, #761). Every event is deep-scrubbed for PII
 * and secret material before it leaves the client, and session replays mask all
 * text and input values.
 */
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || process.env.NODE_ENV,
  release: process.env.NEXT_PUBLIC_SENTRY_RELEASE,
  tracesSampleRate: Number(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? "0.1"),
  enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
  integrations: [
    Sentry.replayIntegration({
      maskAllText: true,
      maskAllInputs: true,
      blockAllMedia: true,
    }),
  ],
  replaysSessionSampleRate: Number(
    process.env.NEXT_PUBLIC_SENTRY_REPLAYS_SESSION_SAMPLE_RATE ?? "0.1"
  ),
  replaysOnErrorSampleRate: Number(
    process.env.NEXT_PUBLIC_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE ?? "1.0"
  ),
  beforeSend(event) {
    return scrubSentryEvent(event);
  },
});

/** Sentry filtering entry point. Also exported for tests and runtime adapters. */
export { scrubSentryEvent, scrubSentryEvent as scrubEvent };
