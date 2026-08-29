"use client";

import { useEffect, useState } from "react";
import { isLookalikeHost } from "../../lib/canonicalHost";

const DISMISSED_KEY = "delego_domain_warning_dismissed";
const SECURITY_CONTACT = "security@delego.app";

/**
 * Anti-phishing warning banner (#593). Popular fintech UIs get cloned onto
 * lookalike domains to harvest approvals — this compares the host the app
 * is actually running on against the configured canonical host(s) and warns
 * when they don't match.
 *
 * Dismissible, but the dismissal is scoped to the browser session
 * (sessionStorage) rather than the component or a single navigation: once
 * dismissed it stays dismissed until the tab/session ends, it doesn't
 * resurface on every client-side route change. Config absent or the host
 * matching the canonical list ⇒ renders nothing.
 *
 * Rendered client-only: reads `window.location.hostname` and
 * sessionStorage, neither of which exist during SSR, so it starts hidden
 * and reveals itself in an effect to avoid a hydration mismatch (same
 * pattern as DemoBanner).
 */
export function DomainWarningBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!isLookalikeHost(window.location.hostname)) return;

    let dismissed = false;
    try {
      dismissed = window.sessionStorage.getItem(DISMISSED_KEY) === "1";
    } catch {
      // sessionStorage unavailable (private browsing, etc.) — fail open and show the warning.
    }
    setVisible(!dismissed);
  }, []);

  if (!visible) return null;

  function handleDismiss() {
    try {
      window.sessionStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      // Best effort — the banner will just resurface on the next load.
    }
    setVisible(false);
  }

  return (
    <div className="domain-warning-banner" role="alert">
      <span className="domain-warning-banner-icon" aria-hidden="true">
        🚫
      </span>
      <span>
        <strong>You&apos;re not on delego.app</strong> — transactions
        approved here may not be trustworthy. If you didn&apos;t navigate
        here yourself, close this tab. Questions?{" "}
        <a href={`mailto:${SECURITY_CONTACT}`}>{SECURITY_CONTACT}</a>
      </span>
      <button
        type="button"
        className="domain-warning-banner-dismiss"
        onClick={handleDismiss}
        aria-label="Dismiss domain warning"
      >
        ✕
      </button>
    </div>
  );
}
