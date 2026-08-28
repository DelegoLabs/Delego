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
import { QueueInspectorModal } from "../offline/QueueInspectorModal";
import { DemoBanner } from "../demo/DemoBanner";
import { IdleSessionGuard } from "../session/IdleSessionGuard";
import { DomainWarningBanner } from "../security/DomainWarningBanner";

/**
 * Client-side context providers shared across the app shell.
 * Kept in one place so the root layout can stay a server component.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  useEffect(() => {
    return initReplayEngine();
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
