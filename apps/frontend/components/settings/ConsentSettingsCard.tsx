"use client";

import { useState } from "react";
import { Card } from "@delegolabs/ui";
import { useConsent } from "../../hooks/useConsent";
import type { ConsentLogEntry } from "../../lib/consent";

const CATEGORY_LABEL: Record<ConsentLogEntry["category"], string> = {
  productAnalytics: "Product analytics",
  marketing: "Marketing",
};

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/**
 * Settings -> Privacy: full consent center (#612). Per-category toggles
 * with plain-language disclosures, plus a history view of every change —
 * stored, mutable, and auditable, per the consent model in lib/consent.ts.
 *
 * Toggling a category here calls `useConsent().setCategory`, which applies
 * immediately: `lib/analytics.ts`'s `trackEvent`/`trackMarketingEvent`
 * re-read consent on every call, so a change here affects the very next
 * event, including ones fired later in the same session — no reload, no
 * "restart the app for this to take effect".
 */
export function ConsentSettingsCard() {
  const { preferences, log, setCategory } = useConsent();
  const [showLog, setShowLog] = useState(false);

  return (
    <Card title="Privacy & consent" ariaLabel="Privacy and consent settings">
      <div className="settings-section">
        <div className="settings-toggle-row">
          <div>
            <p className="settings-toggle-label">Essential</p>
            <p className="settings-toggle-hint">
              Required for the app to function — signing transactions,
              security checks, and error reporting. Not tracking, and can&apos;t
              be turned off.
            </p>
          </div>
          <input type="checkbox" checked disabled aria-label="Essential (always on)" />
        </div>

        <div className="settings-toggle-row">
          <div>
            <p className="settings-toggle-label">Product analytics</p>
            <p className="settings-toggle-hint">
              Helps us understand which features are used and where people
              get stuck, so we can improve the app. We collect page views
              and feature interactions — never your transaction details,
              wallet contents, or personal data.
            </p>
          </div>
          <input
            type="checkbox"
            checked={preferences.productAnalytics}
            onChange={(e) => setCategory("productAnalytics", e.target.checked)}
            aria-label="Product analytics"
          />
        </div>

        <div className="settings-toggle-row">
          <div>
            <p className="settings-toggle-label">Marketing</p>
            <p className="settings-toggle-hint">
              Used to measure the effectiveness of marketing campaigns and
              tailor what we show you about Delego elsewhere. Off by
              default.
            </p>
          </div>
          <input
            type="checkbox"
            checked={preferences.marketing}
            onChange={(e) => setCategory("marketing", e.target.checked)}
            aria-label="Marketing"
          />
        </div>

        <div className="form-actions">
          <button
            type="button"
            className="consent-banner-customize-link"
            onClick={() => setShowLog((v) => !v)}
            aria-expanded={showLog}
          >
            {showLog ? "Hide consent history" : "View consent history"}
          </button>
        </div>

        {showLog && (
          <div className="settings-section" aria-label="Consent history">
            {log.length === 0 ? (
              <p className="settings-toggle-hint">
                No consent changes recorded yet.
              </p>
            ) : (
              <ul className="consent-log-list">
                {log
                  .slice()
                  .reverse()
                  .map((entry, i) => (
                    <li key={`${entry.timestamp}-${entry.category}-${i}`} className="consent-log-entry">
                      <span>
                        {CATEGORY_LABEL[entry.category]}{" "}
                        {entry.granted ? "granted" : "revoked"}
                      </span>
                      <time dateTime={entry.timestamp}>
                        {formatTimestamp(entry.timestamp)}
                      </time>
                    </li>
                  ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
