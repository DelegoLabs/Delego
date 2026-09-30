import type { Event } from "@sentry/nextjs";

/**
 * Sentry PII scrubbing (#761).
 *
 * Client error reports can carry form values, full shipping addresses, and
 * Stellar secret seeds through exception messages, breadcrumbs, `extra`, and
 * request data. `scrubSentryEvent` deep-clones an event and replaces every
 * matching string with a non-reversible marker before the event leaves the
 * process.
 *
 * The function is pure: the input event is never mutated.
 */

/** Replacement text for a canonical 56-character Stellar secret seed (`S…`). */
export const REDACTED_STELLAR_SECRET = "[REDACTED_STELLAR_SECRET]";
/** Replacement text for an email address. */
export const REDACTED_EMAIL = "[REDACTED_EMAIL]";
/** Replacement text for a street address. */
export const REDACTED_ADDRESS = "[REDACTED_ADDRESS]";
/** Replacement value for keys that are always sensitive (credentials, PANs). */
export const REDACTED_VALUE = "[REDACTED]";

/**
 * Canonical Stellar secret seed: `S` followed by 55 base32 characters
 * (A-Z, 2-7), 56 characters in total. Word boundaries keep 56-character public
 * keys (`G…`) and other base32 runs from matching.
 */
const STELLAR_SECRET_RE = /\bS[A-Z2-7]{55}\b/g;

/** Common email address shape, including plus-addressing and subdomains. */
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

/** House number + street name + street suffix, with an optional unit number. */
const STREET_ADDRESS_RE =
  /\b\d{1,6}\s+(?:[A-Za-z0-9][A-Za-z0-9.'-]*\s+){0,4}(?:street|st|avenue|ave|road|rd|boulevard|blvd|lane|ln|drive|dr|court|ct|circle|cir|way|place|pl|terrace|ter|highway|hwy|parkway|pkwy|square|sq|trail|trl|alley|aly)\b\.?(?:\s*(?:apt|apartment|suite|ste|unit|#)\s*[A-Za-z0-9-]+)?/gi;

/**
 * Object keys whose value is redacted regardless of content — credentials and
 * financial identifiers a pattern cannot reliably recognise.
 */
const SENSITIVE_KEY_RE =
  /^(?:password|passwd|pwd|secret|seed|mnemonic|token|access[_-]?token|refresh[_-]?token|authorization|cookie|api[_-]?key|private[_-]?key|card[_-]?number|credit[_-]?card|cvv|cvc|ssn|social[_-]?security[_-]?number)$/i;

/** Redact Stellar secret seeds, emails, and street addresses from a string. */
export function scrubString(value: string): string {
  return value
    .replace(STELLAR_SECRET_RE, REDACTED_STELLAR_SECRET)
    .replace(EMAIL_RE, REDACTED_EMAIL)
    .replace(STREET_ADDRESS_RE, REDACTED_ADDRESS);
}

/** Deep-clone `value`, redacting every string and any sensitive-keyed value. */
function scrubValue(value: unknown, seen: WeakMap<object, unknown>): unknown {
  if (typeof value === "string") return scrubString(value);
  if (typeof value !== "object" || value === null) return value;

  const cached = seen.get(value);
  if (cached !== undefined) return cached;

  if (Array.isArray(value)) {
    const clone: unknown[] = [];
    seen.set(value, clone);
    for (const item of value) clone.push(scrubValue(item, seen));
    return clone;
  }

  const clone: Record<string, unknown> = {};
  seen.set(value, clone);
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    clone[key] = SENSITIVE_KEY_RE.test(key) ? REDACTED_VALUE : scrubValue(child, seen);
  }
  return clone;
}

/** Drop cookies and auth headers entirely rather than redacting them in place. */
function deleteRequestSecrets(event: Event): void {
  const request = event.request as unknown as Record<string, unknown> | undefined;
  if (!request || typeof request !== "object") return;

  delete request.cookies;

  const headers = request.headers as unknown as Record<string, unknown> | undefined;
  if (!headers || typeof headers !== "object") return;

  for (const key of Object.keys(headers)) {
    const lower = key.toLowerCase();
    if (lower === "authorization" || lower === "cookie") delete headers[key];
  }
}

/** `localStorage`/`sessionStorage` snapshots must never leave the browser. */
function deleteStorageSnapshots(event: Event): void {
  const extra = event.extra as Record<string, unknown> | undefined;
  if (!extra || typeof extra !== "object") return;

  delete extra.localStorage;
  delete extra.sessionStorage;
}

/**
 * Deep-scrub a Sentry event before it is transmitted.
 *
 * Redacts Stellar secret seeds, emails, and street addresses from messages,
 * exception values (including captured stack-frame variables), breadcrumbs,
 * `extra`, request data, contexts, and tags; replaces values under known
 * credential/payment keys; and removes cookies, auth headers, and browser
 * storage snapshots. Returns a new event instance.
 */
export function scrubSentryEvent(event: Event): Event {
  const scrubbed = scrubValue(event, new WeakMap()) as Event;
  deleteRequestSecrets(scrubbed);
  deleteStorageSnapshots(scrubbed);
  return scrubbed;
}
