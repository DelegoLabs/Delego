"use client";

import { useEffect, type ReactNode } from "react";

import { NetworkProvider } from "../../hooks/useNetwork";
import { NotificationProvider } from "../../hooks/useNotifications";
import { AnnounceProvider } from "../../hooks/useAnnounce";
import { CurrencyProvider } from "../../hooks/useCurrency";
import { TimeFormatProvider } from "../../hooks/useTimeFormat";
import { FeatureFlagProvider } from "./FeatureFlagProvider";
import { MockApiProvider } from "./MockApiProvider";
import { SentryBreadcrumbs } from "./SentryBreadcrumbs";
import { WebVitalsReporter } from "./WebVitalsReporter";
import { TourProvider } from "../tour/TourProvider";
import { NetworkMismatchModal } from "../network/NetworkMismatchModal";
import { initReplayEngine } from "../../lib/replayEngine";
import { setAnalyticsEmitter } from "../../lib/analytics";
import { QueueInspectorModal } from "../offline/QueueInspectorModal";
import { DemoBanner } from "../demo/DemoBanner";
import { IdleSessionGuard } from "../session/IdleSessionGuard";
import { DomainWarningBanner } from "../security/DomainWarningBanner";
import { ConsentBanner } from "../consent/ConsentBanner";

/**
 * Client-side context providers shared across the app shell.
 * Kept in one place so the root layout can stay a server component.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  useEffect(() => {
    return initReplayEngine();
  }, []);

  useEffect(() => {
    // Default telemetry destination (#612): logs to the console in dev so
    // the consent gate is visibly exercised without wiring a real vendor
    // SDK. `lib/analytics.ts`'s trackEvent/trackMarketingEvent already
    // gate every call on consent before it ever reaches this emitter —
    // swap this for a real destination (Segment, PostHog, ...) when one is
    // chosen, without touching the gating logic.
    if (process.env.NODE_ENV !== "production") {
      setAnalyticsEmitter((event) => {
        // eslint-disable-next-line no-console
        console.debug("[analytics]", event.name, event.properties ?? {});
      });
    }
  }, []);

  return (
    <FeatureFlagProvider>
      <MockApiProvider>
        <NetworkProvider>
          <CurrencyProvider>
            <TimeFormatProvider>
              <AnnounceProvider>
                <NotificationProvider>
                  <TourProvider>
                    <DomainWarningBanner />
                    <ConsentBanner />
                    <DemoBanner />
                    <SentryBreadcrumbs />
                    <WebVitalsReporter />
                    <QueueInspectorModal />
                    {children}
                    <NetworkMismatchModal />
                    <IdleSessionGuard />
                  </TourProvider>
                </NotificationProvider>
              </AnnounceProvider>
            </TimeFormatProvider>
          </CurrencyProvider>
        </NetworkProvider>
      </MockApiProvider>
    </FeatureFlagProvider>
  );
}
