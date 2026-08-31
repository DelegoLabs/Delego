"use client";

import { useMemo, useState } from "react";
import { Button } from "@delegolabs/ui";
import {
  decodeTransactionPreview,
  truncateAddress,
  type TransactionPreview,
  type DecodedOperation,
} from "../../lib/decodeTransactionPreview";
import { useNetwork } from "../../hooks/useNetwork";

export interface TransactionPreviewModalProps {
  /** Unsigned transaction envelope XDR, built but not yet signed. */
  xdr: string;
  onCancel: () => void;
  /** Called once the user confirms — the caller performs the actual `signTransaction` call. */
  onConfirm: () => void | Promise<void>;
  confirming?: boolean;
}

function AddressField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access can be denied by browser permissions — silently
      // no-op rather than surfacing an error for a non-critical convenience action.
    }
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.375rem",
        fontSize: "0.8125rem",
      }}
    >
      <span style={{ color: "var(--color-text-muted, #6b7280)" }}>
        {label}:
      </span>
      <code title={value}>{truncateAddress(value)}</code>
      <button
        type="button"
        onClick={handleCopy}
        aria-label={`Copy full ${label.toLowerCase()} address`}
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          fontSize: "0.75rem",
        }}
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

function DecodedOperationRow({ operation }: { operation: DecodedOperation }) {
  if (operation.kind === "unrecognized") {
    return (
      <div
        role="alert"
        style={{
          padding: "0.625rem",
          borderRadius: "0.5rem",
          border: "1px solid #f59e0b",
          background: "#fffbeb",
        }}
      >
        <p style={{ margin: 0, fontWeight: 600 }}>Unrecognized operation</p>
        <p style={{ margin: "0.25rem 0 0", fontSize: "0.8125rem" }}>
          {operation.summary}
        </p>
        <details style={{ marginTop: "0.375rem" }}>
          <summary style={{ fontSize: "0.75rem", cursor: "pointer" }}>
            Raw details
          </summary>
          <pre style={{ fontSize: "0.75rem", whiteSpace: "pre-wrap" }}>
            {JSON.stringify(
              {
                operationType: operation.operationType,
                functionName: operation.functionName,
              },
              null,
              2
            )}
          </pre>
        </details>
      </div>
    );
  }

  const addressLabel =
    operation.kind === "escrow_release" ? "Recipient" : "Spender";
  const addressValue =
    operation.kind === "escrow_release"
      ? operation.recipient
      : operation.spender;

  return (
    <div
      style={{
        padding: "0.625rem",
        borderRadius: "0.5rem",
        border: "1px solid var(--color-border, #e5e7eb)",
      }}
    >
      <p style={{ margin: 0 }}>{operation.summary}</p>
      <div style={{ marginTop: "0.375rem" }}>
        <AddressField label={addressLabel} value={addressValue} />
      </div>
    </div>
  );
}

/**
 * Decodes and displays an unsigned transaction before it's handed to the
 * wallet adapter's `signTransaction` (#585). Never guesses at unknown
 * operations — see `lib/decodeTransactionPreview.ts`'s "unrecognized
 * operation" fallback, which shows the raw operation type/function name
 * instead of a fabricated summary.
 *
 * `onConfirm` is the only path that proceeds to signing — closing or
 * cancelling this modal must never invoke it.
 */
export function TransactionPreviewModal({
  xdr,
  onCancel,
  onConfirm,
  confirming = false,
}: TransactionPreviewModalProps) {
  const { network } = useNetwork();

  const preview = useMemo<TransactionPreview | { error: string }>(() => {
    try {
      return decodeTransactionPreview(xdr, network.networkPassphrase);
    } catch (err) {
      return {
        error:
          err instanceof Error ? err.message : "Failed to decode transaction.",
      };
    }
  }, [xdr, network.networkPassphrase]);

  const hasError = "error" in preview;

  return (
    <div className="approval-drawer-overlay" onClick={onCancel}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Review transaction before signing"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--color-surface, #fff)",
          borderRadius: "0.75rem",
          padding: "1.25rem",
          maxWidth: "30rem",
          margin: "8vh auto",
          display: "flex",
          flexDirection: "column",
          gap: "0.75rem",
        }}
      >
        <h2>Review before signing</h2>

        {hasError ? (
          <p role="alert" style={{ color: "#991b1b" }}>
            {preview.error}
          </p>
        ) : (
          <>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "0.5rem",
              }}
            >
              {preview.operations.map((op, i) => (
                <DecodedOperationRow key={i} operation={op} />
              ))}
            </div>

            <div
              style={{
                fontSize: "0.8125rem",
                display: "flex",
                flexDirection: "column",
                gap: "0.25rem",
              }}
            >
              <AddressField label="From" value={preview.sourceAccount} />
              <span>Fee: {preview.fee} stroops</span>
              {preview.memo && <span>Memo: {preview.memo}</span>}
            </div>
          </>
        )}

        <div className="form-actions">
          <Button variant="ghost" onClick={onCancel} disabled={confirming}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() => void onConfirm()}
            disabled={hasError || confirming}
            loading={confirming}
          >
            Confirm & sign
          </Button>
        </div>
      </div>
    </div>
  );
}
