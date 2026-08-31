import { env } from "./env";

/**
 * Anti-phishing canonical-domain check (#593).
 *
 * Popular fintech UIs get cloned onto lookalike domains to harvest
 * approvals. `NEXT_PUBLIC_CANONICAL_HOSTS` names the real, trusted host(s)
 * for the app; anything else the app is served from — other than local dev
 * and Vercel PR previews — is flagged as a possible lookalike.
 */

/** Hostnames that are always trusted regardless of the canonical list: local dev. */
const DEV_HOST_ALLOWLIST = ["localhost", "127.0.0.1"];

/** Hostname suffixes that are always trusted: Vercel PR preview deployments (see .github/workflows/preview-deploy.yml). */
const PREVIEW_HOST_SUFFIXES = [".vercel.app"];

function parseCanonicalHosts(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
}

/** The configured canonical host(s) for this deployment, lowercased. Empty when unconfigured. */
export const CANONICAL_HOSTS: readonly string[] = parseCanonicalHosts(
  env.NEXT_PUBLIC_CANONICAL_HOSTS
);

/** True for local dev and Vercel preview hosts — these never trigger the warning, canonical list or not. */
export function isAllowlistedHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return (
    DEV_HOST_ALLOWLIST.includes(normalized) ||
    PREVIEW_HOST_SUFFIXES.some((suffix) => normalized.endsWith(suffix))
  );
}

/**
 * True when `hostname` looks like a lookalike domain — i.e. the app is
 * configured with canonical host(s), `hostname` isn't one of them, and it
 * isn't an allowlisted dev/preview host. Always false when no canonical
 * hosts are configured so the feature is inert until explicitly set up.
 */
export function isLookalikeHost(
  hostname: string,
  canonicalHosts: readonly string[] = CANONICAL_HOSTS
): boolean {
  if (canonicalHosts.length === 0) return false;
  const normalized = hostname.toLowerCase();
  if (canonicalHosts.includes(normalized)) return false;
  if (isAllowlistedHost(normalized)) return false;
  return true;
}
