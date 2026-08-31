"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@delegolabs/ui";
import {
  hasConsentChoice,
  acceptAllConsent,
  acceptEssentialOnlyConsent,
} from "../../lib/consent";

/**
 * First-run privacy/telemetry consent banner (#612).
 *
 * Minimal by design: essential-only is already in effect by default (see
 * `lib/consent.ts` — `trackEvent`/`trackMarketingEvent` no-op until a
 * choice is made), so this banner never blocks anything — it's an
 * informational, non-modal strip offering "Accept all" or a link to the
 * full Settings -> Privacy center for granular choices. Dismissing without
 * choosing is itself a choice: it records essential-only, the same state
 * already in effect, so there's no gap between "banner visible" and
 * "consent decided" either way.
 *
 * Rendered client-only (reads localStorage via `hasConsentChoice`), so it
 * starts hidden and reveals itself in an effect to avoid a hydration
 * mismatch — same pattern as DomainWarningBanner/DemoBanner.
 */
export function ConsentBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(!hasConsentChoice());
  }, []);

  if (!visible) return null;

  function handleAcceptAll() {
    acceptAllConsent();
    setVisible(false);
  }

  function handleDismiss() {
    acceptEssentialOnlyConsent();
    setVisible(false);
  }

  return (
    <div className="consent-banner" role="region" aria-label="Privacy preferences">
      <p className="consent-banner-text">
        We use essential functionality by default. With your permission
        we&apos;d also like to use product analytics to improve the app —
        you can change this any time in Settings.
      </p>
      <div className="consent-banner-actions">
        <Link href="/settings" className="consent-banner-customize-link">
          Customize
        </Link>
        <Button variant="secondary" size="sm" onClick={handleDismiss}>
          Essential only
        </Button>
        <Button variant="primary" size="sm" onClick={handleAcceptAll}>
          Accept all
        </Button>
      </div>
    </div>
  );
}
