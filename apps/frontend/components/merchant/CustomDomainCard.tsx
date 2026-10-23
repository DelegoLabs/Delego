"use client";

import { useEffect, useState } from "react";
import { Card } from "@delegolabs/ui";
import {
  CNAME_TARGET,
  checkDomainRouting,
  clearDomainRoutingStatus,
  isValidDomain,
  loadCustomDomain,
  loadDomainRoutingStatus,
  normalizeDomain,
  saveCustomDomain,
  saveDomainRoutingStatus,
  type DomainRoutingStatus,
} from "../../lib/domainRouting";
import { DomainStatusBadge } from "./DomainStatusBadge";

export interface CustomDomainCardProps {
  initialDomain?: string;
  checkDomain?: (domain: string) => Promise<DomainRoutingStatus>;
  onStatusChange?: (status: DomainRoutingStatus) => void;
  className?: string;
}

async function writeToClipboard(value: string): Promise<void> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  if (typeof document === "undefined") {
    throw new Error("Clipboard is unavailable.");
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand ? document.execCommand("copy") : false;
  document.body.removeChild(textarea);

  if (!copied) {
    throw new Error("Clipboard is unavailable.");
  }
}

export function CustomDomainCard({
  initialDomain,
  checkDomain = checkDomainRouting,
  onStatusChange,
  className,
}: CustomDomainCardProps) {
  const [domain, setDomain] = useState(initialDomain ?? "");
  const [status, setStatus] = useState<DomainRoutingStatus | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const nextDomain = initialDomain ?? loadCustomDomain();
    setDomain(nextDomain);

    const savedStatus = loadDomainRoutingStatus();
    if (savedStatus && savedStatus.domain === normalizeDomain(nextDomain)) {
      setStatus(savedStatus);
    }
  }, [initialDomain]);

  useEffect(() => {
    if (!copied) return;
    const timeout = setTimeout(() => setCopied(false), 2_000);
    return () => clearTimeout(timeout);
  }, [copied]);

  function handleDomainChange(value: string) {
    setDomain(value);
    setStatus(null);
    setError(null);
    setCopied(false);
    clearDomainRoutingStatus();
  }

  async function handleCopy() {
    try {
      await writeToClipboard(status?.cnameTarget ?? CNAME_TARGET);
      setCopied(true);
      setError(null);
    } catch {
      setError("Could not copy the CNAME record. Select the value and copy it manually.");
    }
  }

  async function handleCheck() {
    const normalized = normalizeDomain(domain);
    if (!isValidDomain(normalized)) {
      setStatus(null);
      setError("Enter a valid domain name, such as shop.mybrand.com.");
      return;
    }

    setChecking(true);
    setError(null);

    try {
      const result = await checkDomain(normalized);
      setDomain(result.domain);
      setStatus(result);
      saveCustomDomain(result.domain);
      saveDomainRoutingStatus(result);
      onStatusChange?.(result);
    } catch (err) {
      setStatus(null);
      setError(
        err instanceof Error
          ? err.message
          : "Could not check DNS records. Please try again."
      );
    } finally {
      setChecking(false);
    }
  }

  const target = status?.cnameTarget ?? CNAME_TARGET;

  return (
    <Card
      className={className}
      data-testid="custom-domain-card"
      ariaLabel="Custom domain settings"
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: "1rem",
          flexWrap: "wrap",
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: "1.125rem", fontWeight: 700 }}>
            Custom Domain
          </h2>
          <p style={{ margin: "0.25rem 0 0", fontSize: "0.8125rem", color: "#6b7280" }}>
            Point your storefront domain at Delego and verify DNS routing.
          </p>
        </div>
        {status && (
          <DomainStatusBadge
            status={status.isCnameConfigured ? "configured" : "not-configured"}
          />
        )}
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "0.75rem",
          marginTop: "1rem",
        }}
      >
        <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
          <span style={{ fontSize: "0.8125rem", fontWeight: 600 }}>Custom domain</span>
          <input
            type="text"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            value={domain}
            placeholder="shop.mybrand.com"
            aria-label="Custom domain"
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "custom-domain-error" : undefined}
            data-testid="custom-domain-input"
            onChange={(event) => handleDomainChange(event.target.value)}
            style={{
              padding: "0.5rem 0.625rem",
              borderRadius: "0.5rem",
              border: `1px solid ${error ? "#dc2626" : "#d1d5db"}`,
              fontSize: "0.8125rem",
            }}
          />
        </label>

        <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
          <span style={{ fontSize: "0.8125rem", fontWeight: 600 }}>
            Target CNAME record
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
            <code
              data-testid="cname-target"
              style={{
                padding: "0.5rem 0.625rem",
                borderRadius: "0.5rem",
                background: "#f3f4f6",
                fontSize: "0.8125rem",
                wordBreak: "break-all",
              }}
            >
              {target}
            </code>
            <button
              type="button"
              onClick={handleCopy}
              aria-label="Copy CNAME target"
              data-testid="copy-cname-button"
              style={{
                padding: "0.5rem 0.875rem",
                borderRadius: "0.5rem",
                border: "1px solid #d1d5db",
                background: "#fff",
                fontWeight: 600,
                fontSize: "0.8125rem",
                cursor: "pointer",
              }}
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={handleCheck}
            disabled={checking}
            data-testid="check-dns-button"
            style={{
              padding: "0.5rem 1rem",
              borderRadius: "0.5rem",
              border: "none",
              background: "#2563eb",
              color: "#fff",
              fontWeight: 600,
              fontSize: "0.8125rem",
              cursor: checking ? "wait" : "pointer",
              opacity: checking ? 0.75 : 1,
            }}
          >
            {checking ? "Checking DNS…" : "Check DNS Records"}
          </button>
          {checking && <DomainStatusBadge status="checking" />}
        </div>

        {error && (
          <p
            id="custom-domain-error"
            role="alert"
            data-testid="domain-check-error"
            style={{ margin: 0, fontSize: "0.75rem", color: "#dc2626" }}
          >
            {error}
          </p>
        )}

        {status && (
          <div
            aria-live="polite"
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "0.5rem",
              padding: "0.75rem",
              borderRadius: "0.5rem",
              border: "1px solid #e5e7eb",
              background: "#fafafa",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem" }}>
              <span style={{ fontSize: "0.8125rem", fontWeight: 600 }}>CNAME record</span>
              <DomainStatusBadge
                status={status.isCnameConfigured ? "configured" : "not-configured"}
                data-testid="cname-status-badge"
              />
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem" }}>
              <span style={{ fontSize: "0.8125rem", fontWeight: 600 }}>SSL certificate</span>
              <DomainStatusBadge
                status={status.sslStatus}
                data-testid="ssl-status-badge"
              />
            </div>
            <span
              data-testid="last-checked-at"
              style={{ fontSize: "0.75rem", color: "#6b7280" }}
            >
              Last checked {new Date(status.lastCheckedAt).toLocaleString()}
            </span>
          </div>
        )}

        {status && !status.isCnameConfigured && (
          <div
            role="alert"
            data-testid="dns-diagnostics"
            style={{
              padding: "0.75rem",
              borderRadius: "0.5rem",
              border: "1px solid #fecaca",
              background: "#fef2f2",
              color: "#991b1b",
              fontSize: "0.8125rem",
            }}
          >
            <strong>DNS is not pointing at Delego yet.</strong>
            <ol style={{ margin: "0.5rem 0 0", paddingLeft: "1.25rem" }}>
              <li>
                Open your DNS provider and create a <code>CNAME</code> record for{" "}
                <code>{status.domain}</code>.
              </li>
              <li>
                Set the record value to <code>{status.cnameTarget}</code>.
              </li>
              <li>
                Remove any conflicting <code>A</code> or <code>AAAA</code> records on the
                same host.
              </li>
              <li>
                Wait for propagation (up to 48 hours), then select{" "}
                <strong>Check DNS Records</strong> again.
              </li>
            </ol>
          </div>
        )}

        {status && status.isCnameConfigured && status.sslStatus === "pending" && (
          <p
            data-testid="ssl-pending-note"
            style={{ margin: 0, fontSize: "0.75rem", color: "#92400e" }}
          >
            CNAME looks correct. Delego is still issuing your SSL certificate; this
            can take a few minutes after propagation.
          </p>
        )}

        {status && status.isCnameConfigured && status.sslStatus === "error" && (
          <p
            data-testid="ssl-error-note"
            style={{ margin: 0, fontSize: "0.75rem", color: "#dc2626" }}
          >
            CNAME looks correct, but the SSL certificate could not be issued. Check
            that no conflicting DNS records remain, then try again.
          </p>
        )}
      </div>
    </Card>
  );
}
