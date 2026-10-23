import type { DomainRoutingStatus, DomainSslStatus } from "@delegolabs/types";

export type { DomainRoutingStatus, DomainSslStatus };

export const CNAME_TARGET = "cname.delego.market";
export const DNS_OVER_HTTPS_ENDPOINT = "https://cloudflare-dns.com/dns-query";
export const CUSTOM_DOMAIN_STORAGE_KEY = "delego_merchant_custom_domain";
export const DOMAIN_ROUTING_STATUS_STORAGE_KEY = "delego_merchant_domain_routing_status";

const CNAME_RECORD_TYPE = 5;
const DNS_STATUS_NOERROR = 0;
const DNS_STATUS_NXDOMAIN = 3;
const SSL_PROBE_TIMEOUT_MS = 5_000;
const DOMAIN_LABEL_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;

interface DnsAnswer {
  type: number;
  data: string;
}

interface DnsResponse {
  Status?: number;
  Answer?: DnsAnswer[];
}

export interface DomainCheckOptions {
  fetchImpl?: typeof fetch;
  now?: () => Date;
  cnameTarget?: string;
  dnsEndpoint?: string;
}

export function normalizeDomain(value: string): string {
  if (!value) return "";
  let domain = value.trim().toLowerCase();
  domain = domain.replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
  domain = domain.split("/")[0] ?? "";
  domain = domain.split("?")[0] ?? "";
  domain = domain.split("#")[0] ?? "";
  domain = domain.replace(/:\d+$/, "");
  domain = domain.replace(/\.+$/, "");
  return domain;
}

export function isValidDomain(value: string): boolean {
  const domain = normalizeDomain(value);
  if (!domain || domain.length > 253) return false;

  const labels = domain.split(".");
  if (labels.length < 2) return false;
  if (!labels.every((label) => DOMAIN_LABEL_PATTERN.test(label))) return false;

  const tld = labels[labels.length - 1];
  return /^[a-z]{2,63}$/i.test(tld) || /^xn--[a-z0-9-]{2,59}$/i.test(tld);
}

export function normalizeCnameTarget(value: string): string {
  return value.trim().toLowerCase().replace(/\.+$/, "");
}

export function extractCnameTargets(response: Pick<DnsResponse, "Answer">): string[] {
  if (!response.Answer) return [];
  return response.Answer.filter(
    (answer) => answer.type === CNAME_RECORD_TYPE && typeof answer.data === "string"
  )
    .map((answer) => normalizeCnameTarget(answer.data))
    .filter(Boolean);
}

export function hasExpectedCname(
  targets: readonly string[],
  expectedTarget: string = CNAME_TARGET
): boolean {
  const expected = normalizeCnameTarget(expectedTarget);
  return targets.some((target) => normalizeCnameTarget(target) === expected);
}

export async function resolveCnameTargets(
  domain: string,
  options: DomainCheckOptions = {}
): Promise<string[]> {
  const normalized = normalizeDomain(domain);
  if (!isValidDomain(normalized)) {
    throw new Error("Enter a valid domain name, such as shop.mybrand.com.");
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const endpoint = options.dnsEndpoint ?? DNS_OVER_HTTPS_ENDPOINT;
  const separator = endpoint.includes("?") ? "&" : "?";
  const url = `${endpoint}${separator}name=${encodeURIComponent(normalized)}&type=CNAME`;

  const response = await fetchImpl(url, {
    headers: { Accept: "application/dns-json" },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`DNS lookup failed (${response.status}).`);
  }

  const payload = (await response.json()) as DnsResponse;
  if (
    payload.Status !== undefined &&
    payload.Status !== DNS_STATUS_NOERROR &&
    payload.Status !== DNS_STATUS_NXDOMAIN
  ) {
    throw new Error(`DNS lookup failed with status ${payload.Status}.`);
  }

  return extractCnameTargets(payload);
}

export async function probeSslStatus(
  domain: string,
  fetchImpl: typeof fetch = fetch
): Promise<DomainSslStatus> {
  const normalized = normalizeDomain(domain);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SSL_PROBE_TIMEOUT_MS);

  try {
    await fetchImpl(`https://${normalized}/`, {
      method: "HEAD",
      mode: "no-cors",
      cache: "no-store",
      signal: controller.signal,
    });
    return "active";
  } catch {
    return "pending";
  } finally {
    clearTimeout(timeout);
  }
}

export async function checkDomainRouting(
  domain: string,
  options: DomainCheckOptions = {}
): Promise<DomainRoutingStatus> {
  const normalized = normalizeDomain(domain);
  if (!isValidDomain(normalized)) {
    throw new Error("Enter a valid domain name, such as shop.mybrand.com.");
  }

  const targets = await resolveCnameTargets(normalized, options);
  const cnameTarget = normalizeCnameTarget(options.cnameTarget ?? CNAME_TARGET);
  const isCnameConfigured = hasExpectedCname(targets, cnameTarget);
  const sslStatus: DomainSslStatus = isCnameConfigured
    ? await probeSslStatus(normalized, options.fetchImpl)
    : "error";
  const now = options.now ?? (() => new Date());

  return {
    domain: normalized,
    cnameTarget,
    isCnameConfigured,
    sslStatus,
    lastCheckedAt: now().toISOString(),
  };
}

function getStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function isSslStatus(value: unknown): value is DomainSslStatus {
  return value === "pending" || value === "active" || value === "error";
}

export function loadCustomDomain(): string {
  try {
    return normalizeDomain(getStorage()?.getItem(CUSTOM_DOMAIN_STORAGE_KEY) ?? "");
  } catch {
    return "";
  }
}

export function saveCustomDomain(domain: string): void {
  const normalized = normalizeDomain(domain);
  if (!normalized) return;
  try {
    getStorage()?.setItem(CUSTOM_DOMAIN_STORAGE_KEY, normalized);
  } catch {
    return;
  }
}

export function loadDomainRoutingStatus(): DomainRoutingStatus | null {
  try {
    const stored = getStorage()?.getItem(DOMAIN_ROUTING_STATUS_STORAGE_KEY);
    if (!stored) return null;

    const parsed = JSON.parse(stored) as Partial<DomainRoutingStatus>;
    if (
      typeof parsed.domain !== "string" ||
      typeof parsed.cnameTarget !== "string" ||
      typeof parsed.isCnameConfigured !== "boolean" ||
      !isSslStatus(parsed.sslStatus) ||
      typeof parsed.lastCheckedAt !== "string"
    ) {
      return null;
    }

    return {
      domain: parsed.domain,
      cnameTarget: parsed.cnameTarget,
      isCnameConfigured: parsed.isCnameConfigured,
      sslStatus: parsed.sslStatus,
      lastCheckedAt: parsed.lastCheckedAt,
    };
  } catch {
    return null;
  }
}

export function saveDomainRoutingStatus(status: DomainRoutingStatus): void {
  try {
    getStorage()?.setItem(DOMAIN_ROUTING_STATUS_STORAGE_KEY, JSON.stringify(status));
  } catch {
    return;
  }
}

export function clearDomainRoutingStatus(): void {
  try {
    getStorage()?.removeItem(DOMAIN_ROUTING_STATUS_STORAGE_KEY);
  } catch {
    return;
  }
}
