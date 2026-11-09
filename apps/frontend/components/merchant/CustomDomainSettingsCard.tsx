"use client";

import { useEffect, useState } from "react";
import { Badge, Button, Card } from "@delegolabs/ui";
import {
  DEFAULT_CNAME_TARGET,
  isValidCustomDomain,
  getRoutingDiagnosticInstructions,
  loadStoredDomainRouting,
  saveStoredDomainRouting,
  validateDomainRouting,
  type DomainRoutingStatus,
} from "../../lib/customDomainRouting";

export interface CustomDomainSettingsCardProps {
  initialDomain?: string;
  className?: string;
  onValidate?: (status: DomainRoutingStatus) => void;
}

export function CustomDomainSettingsCard({
  initialDomain = "",
  className,
  onValidate,
}: CustomDomainSettingsCardProps) {
  const [domain, setDomain] = useState<string>(initialDomain);
  const [routingStatus, setRoutingStatus] = useState<DomainRoutingStatus | null>(null);
  const [isChecking, setIsChecking] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [inputError, setInputError] = useState<string | null>(null);

  useEffect(() => {
    const stored = loadStoredDomainRouting();
    if (stored) {
      setRoutingStatus(stored);
      if (!initialDomain && stored.domain) {
        setDomain(stored.domain);
      }
    }
  }, [initialDomain]);

  const handleCopyTarget = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(DEFAULT_CNAME_TARGET);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      // Fallback
    }
  };

  const handleCheckDns = async () => {
    const trimmed = domain.trim();
    if (!trimmed) {
      setInputError("Please enter your custom domain (e.g. shop.mybrand.com).");
      return;
    }

    if (!isValidCustomDomain(trimmed)) {
      setInputError("Please enter a valid domain format without protocols or paths.");
      return;
    }

    setInputError(null);
    setIsChecking(true);

    try {
      const status = await validateDomainRouting(trimmed, DEFAULT_CNAME_TARGET);
      setRoutingStatus(status);
      saveStoredDomainRouting(status);
      onValidate?.(status);
    } finally {
      setIsChecking(false);
    }
  };

  const diagnostics = routingStatus ? getRoutingDiagnosticInstructions(routingStatus) : [];

  return (
    <Card
      title="Custom Storefront Domain & CNAME Routing"
      titleLevel={3}
      ariaLabel="Custom Storefront Domain Routing Settings"
      className={className}
      data-testid="custom-domain-settings-card"
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem", marginTop: "0.5rem" }}>
        <p style={{ margin: 0, color: "#4b5563", fontSize: "0.875rem", lineHeight: 1.5 }}>
          Point your custom domain (e.g., <code>shop.mybrand.com</code>) to your Delego storefront.
          Configure a CNAME record at your DNS provider and verify routing status in real-time.
        </p>

        {/* Target CNAME Display */}
        <div
          style={{
            padding: "0.875rem 1rem",
            background: "#f9fafb",
            borderRadius: "0.5rem",
            border: "1px solid #e5e7eb",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "0.75rem",
          }}
        >
          <div>
            <span style={{ fontSize: "0.75rem", textTransform: "uppercase", color: "#6b7280", fontWeight: 600 }}>
              Target CNAME Host
            </span>
            <div
              data-testid="cname-target-display"
              style={{ fontFamily: "monospace", fontSize: "0.9375rem", fontWeight: 600, color: "#111827" }}
            >
              {DEFAULT_CNAME_TARGET}
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            onClick={handleCopyTarget}
            data-testid="copy-cname-button"
            ariaLabel="Copy CNAME target to clipboard"
          >
            {copied ? "Copied!" : "Copy Target"}
          </Button>
        </div>

        {/* Domain Input Form */}
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          <label htmlFor="custom-domain-input" style={{ fontSize: "0.875rem", fontWeight: 600, color: "#374151" }}>
            Storefront Custom Domain
          </label>
          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
            <input
              id="custom-domain-input"
              data-testid="custom-domain-input"
              type="text"
              placeholder="shop.mybrand.com"
              value={domain}
              onChange={(e) => {
                setDomain(e.target.value);
                if (inputError) setInputError(null);
              }}
              style={{
                flex: 1,
                minWidth: "220px",
                padding: "0.5rem 0.75rem",
                fontSize: "0.875rem",
                border: inputError ? "1px solid #ef4444" : "1px solid #d1d5db",
                borderRadius: "0.375rem",
                outline: "none",
              }}
            />
            <Button
              type="button"
              variant="primary"
              onClick={handleCheckDns}
              disabled={isChecking}
              data-testid="check-dns-button"
            >
              {isChecking ? "Checking Records..." : "Check DNS Records"}
            </Button>
          </div>
          {inputError && (
            <span data-testid="domain-input-error" style={{ color: "#dc2626", fontSize: "0.8125rem" }}>
              {inputError}
            </span>
          )}
        </div>

        {/* Status Indicators */}
        {routingStatus && (
          <div
            data-testid="dns-status-section"
            style={{
              padding: "1rem",
              borderRadius: "0.5rem",
              background: routingStatus.isCnameConfigured ? "#f0fdf4" : "#fef2f2",
              border: `1px solid ${routingStatus.isCnameConfigured ? "#bbf7d0" : "#fecaca"}`,
              display: "flex",
              flexDirection: "column",
              gap: "0.75rem",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <span style={{ fontSize: "0.875rem", fontWeight: 600, color: "#1f2937" }}>
                  Status for <code>{routingStatus.domain}</code>:
                </span>
                <Badge
                  data-testid="cname-status-badge"
                  tone={routingStatus.isCnameConfigured ? "success" : "error"}
                >
                  {routingStatus.isCnameConfigured ? "CNAME Configured" : "CNAME Unresolved"}
                </Badge>
                <Badge
                  data-testid="ssl-status-badge"
                  tone={
                    routingStatus.sslStatus === "active"
                      ? "success"
                      : routingStatus.sslStatus === "pending"
                      ? "warning"
                      : "error"
                  }
                >
                  {routingStatus.sslStatus === "active"
                    ? "SSL Active"
                    : routingStatus.sslStatus === "pending"
                    ? "SSL Pending"
                    : "SSL Error"}
                </Badge>
              </div>

              <span data-testid="last-checked-timestamp" style={{ fontSize: "0.75rem", color: "#6b7280" }}>
                Checked: {new Date(routingStatus.lastCheckedAt).toLocaleTimeString()}
              </span>
            </div>

            {/* Diagnostic instructions or success confirmation */}
            {diagnostics.length > 0 ? (
              <div
                data-testid="dns-diagnostics-panel"
                style={{
                  marginTop: "0.25rem",
                  padding: "0.75rem",
                  background: "#fff",
                  borderRadius: "0.375rem",
                  border: "1px solid #fed7aa",
                }}
              >
                <h5 style={{ margin: "0 0 0.5rem", fontSize: "0.8125rem", fontWeight: 600, color: "#9a3412" }}>
                  Action Required / Diagnostic Checklist:
                </h5>
                <ul style={{ margin: 0, paddingLeft: "1.25rem", fontSize: "0.8125rem", color: "#431407" }}>
                  {diagnostics.map((instruction, idx) => (
                    <li key={idx} data-testid="diagnostic-instruction-item" style={{ marginBottom: "0.25rem" }}>
                      {instruction}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <div
                data-testid="dns-success-confirmation"
                style={{ fontSize: "0.8125rem", color: "#166534", fontWeight: 500 }}
              >
                ✓ Domain is properly routed to Delego and SSL certificate is fully active.
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
