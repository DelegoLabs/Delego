import { env } from "./env";

export interface CspViolationReport {
  blockedUri: string;
  violatedDirective: string;
  originalPolicy: string;
  documentUri: string;
  timestamp: string;
}

const REPORT_LIMIT = 5;
const REPORT_WINDOW_MS = 60_000;
const reportAttempts: number[] = [];
let listenerCount = 0;

async function sendCspViolationReport(report: CspViolationReport) {
  try {
    const response = await fetch(
      `${env.NEXT_PUBLIC_API_URL}/api/v1/telemetry/csp`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "omit",
        body: JSON.stringify(report),
      }
    );

    if (!response.ok) {
      // eslint-disable-next-line no-console
      console.warn(
        "CSP violation telemetry request failed with status",
        response.status
      );
    }
  } catch {
    // Telemetry must never interfere with application behavior.
    // eslint-disable-next-line no-console
    console.warn("CSP violation telemetry request failed.");
  }
}

function handleSecurityPolicyViolation(event: SecurityPolicyViolationEvent) {
  const now = Date.now();
  while (
    reportAttempts.length > 0 &&
    now - reportAttempts[0] >= REPORT_WINDOW_MS
  ) {
    reportAttempts.shift();
  }
  if (reportAttempts.length >= REPORT_LIMIT) return;

  // Reserve the attempt before dispatch so concurrent events and failures are counted.
  reportAttempts.push(now);

  const report: CspViolationReport = {
    blockedUri: event.blockedURI,
    violatedDirective: event.violatedDirective,
    originalPolicy: event.originalPolicy,
    documentUri: event.documentURI,
    timestamp: new Date(now).toISOString(),
  };

  void sendCspViolationReport(report);
}

export function initCspViolationReporting(): () => void {
  if (typeof window === "undefined") return () => {};

  if (listenerCount === 0) {
    window.addEventListener(
      "securitypolicyviolation",
      handleSecurityPolicyViolation
    );
  }
  listenerCount += 1;

  let active = true;
  return () => {
    if (!active) return;
    active = false;
    listenerCount -= 1;
    if (listenerCount === 0) {
      window.removeEventListener(
        "securitypolicyviolation",
        handleSecurityPolicyViolation
      );
    }
  };
}
