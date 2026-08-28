"use client";

import { useState } from "react";
import { Button, Card } from "@delegolabs/ui";
import type { ReceiptKind } from "../../services/receiptGetters";
import { useReceiptVerification } from "../../hooks/useReceiptVerification";

export interface OnChainVerificationPanelProps {
  kind: ReceiptKind;
  /** Escrow or permission ID the receipt getter is called with. */
  receiptKey: string;
  /** Configured contract address for this network, or null if unconfigured. */
  contractAddress: string | null;
  /** Locally-displayed order/escrow data to compare against the on-chain receipt. */
  localData: Record<string, unknown>;
  /** Field names to compare — human labels are derived from this list unless overridden below. */
  compareFields: readonly string[];
  fieldLabels?: Partial<Record<string, string>>;
}

const KIND_LABELS: Record<ReceiptKind, string> = {
  buyer: "Buyer receipt",
  merchant: "Merchant receipt",
  permission: "Permission receipt",
};

function formatValue(value: unknown): string {
  if (value === undefined) return "(missing)";
  if (value === null) return "null";
  return String(value);
}

/**
 * "Verify on-chain" section for order/escrow detail pages (#581).
 *
 * Fetches the relevant receipt getter and compares it field-by-field
 * against the locally-displayed data. Distinct from the printable order
 * receipt document (a separate, still-open feature): this is the
 * cryptographic verification view over the on-chain receipt getters,
 * not a human-facing printable artifact.
 */
export function OnChainVerificationPanel({
  kind,
  receiptKey,
  contractAddress,
  localData,
  compareFields,
  fieldLabels,
}: OnChainVerificationPanelProps) {
  const [showRawJson, setShowRawJson] = useState(false);
  const [copied, setCopied] = useState(false);
  const { status, receipt, comparison, error, refresh } =
    useReceiptVerification(
      kind,
      receiptKey,
      contractAddress,
      localData,
      compareFields
    );

  async function handleCopyHash() {
    if (!receipt) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(receipt.data));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Non-critical convenience action — no error surfacing needed.
    }
  }

  if (!contractAddress) {
    return null;
  }

  return (
    <Card
      title={`Verify on-chain — ${KIND_LABELS[kind]}`}
      ariaLabel="On-chain receipt verification"
    >
      {status === "loading" && (
        <p role="status" aria-live="polite">
          Fetching on-chain receipt…
        </p>
      )}

      {status === "error" && (
        <div
          role="alert"
          style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}
        >
          <p style={{ margin: 0 }}>Failed to fetch on-chain receipt: {error}</p>
          <Button variant="secondary" onClick={refresh}>
            Retry
          </Button>
        </div>
      )}

      {status === "loaded" && comparison && (
        <div
          style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}
        >
          {comparison.matches ? (
            <div
              role="status"
              style={{
                padding: "0.625rem",
                borderRadius: "0.5rem",
                border: "1px solid #16a34a",
                background: "#f0fdf4",
                color: "#166534",
              }}
            >
              ✓ On-chain receipt matches local data.
            </div>
          ) : (
            <div
              role="alert"
              style={{
                padding: "0.625rem",
                borderRadius: "0.5rem",
                border: "2px solid #dc2626",
                background: "#fef2f2",
                color: "#991b1b",
                fontWeight: 600,
              }}
            >
              ⚠ Integrity warning: on-chain receipt does not match locally
              displayed data.
            </div>
          )}

          <table
            style={{
              width: "100%",
              fontSize: "0.8125rem",
              borderCollapse: "collapse",
            }}
          >
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>Field</th>
                <th style={{ textAlign: "left" }}>Local</th>
                <th style={{ textAlign: "left" }}>On-chain</th>
                <th style={{ textAlign: "left" }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {comparison.fields.map((f) => (
                <tr key={f.field}>
                  <td>{fieldLabels?.[f.field] ?? f.field}</td>
                  <td>{formatValue(f.localValue)}</td>
                  <td>{formatValue(f.onChainValue)}</td>
                  <td style={{ color: f.matches ? "#166534" : "#991b1b" }}>
                    {f.matches ? "Match" : "Mismatch"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div
            style={{
              display: "flex",
              gap: "0.5rem",
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <Button variant="ghost" onClick={refresh}>
              Refresh
            </Button>
            <Button variant="ghost" onClick={() => setShowRawJson((v) => !v)}>
              {showRawJson ? "Hide raw JSON" : "Show raw JSON"}
            </Button>
            <Button variant="ghost" onClick={handleCopyHash}>
              {copied ? "Copied" : "Copy verified hash"}
            </Button>
          </div>

          {showRawJson && receipt && (
            <pre
              style={{
                fontSize: "0.75rem",
                whiteSpace: "pre-wrap",
                background: "var(--color-surface-alt, #f9fafb)",
                padding: "0.625rem",
                borderRadius: "0.5rem",
                overflow: "auto",
              }}
            >
              {JSON.stringify(receipt.data, null, 2)}
            </pre>
          )}
        </div>
      )}
    </Card>
  );
}
