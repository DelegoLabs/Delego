"use client";

/**
 * Merchant return label generator (#1009), opened from an order's dispute /
 * return actions. The merchant picks the carrier, enters the tracking number
 * and the return hub address, previews the printable 4×6 label, then either
 * downloads the PDF or has it emailed to the buyer.
 *
 * Not to be confused with `components/escrows/ReturnLabelModal` (#796), the
 * buyer-side viewer for a label that already exists.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@delegolabs/ui";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { downloadBlob } from "../lib/download";
import {
  CARRIERS,
  RETURN_LABEL_CARRIERS,
  emailReturnLabelToBuyer,
  generateReturnLabelPdf,
  returnLabelFilename,
  validateReturnLabelConfig,
  type ReturnLabelCarrier,
  type ReturnLabelConfig,
} from "../lib/returnShippingLabel";
import { ReturnShippingLabelPDF } from "./ReturnShippingLabelPDF";

export type { ReturnLabelConfig } from "../lib/returnShippingLabel";

/** Last-used hub address, remembered per device for the next label. */
export const RETURN_HUB_STORAGE_KEY = "delego.merchant.returnHubAddress";

export interface ReturnLabelModalProps {
  open: boolean;
  orderId: string;
  /** Buyer's shipping address — the label's ship-from. */
  buyerAddress: string;
  onClose: () => void;
  /** Overridable for tests. */
  generatePdf?: (config: ReturnLabelConfig) => Promise<Blob>;
  emailToBuyer?: (config: ReturnLabelConfig, pdf: Blob) => Promise<void>;
  download?: (filename: string, blob: Blob) => void;
}

type Status =
  | { kind: "idle" }
  | { kind: "busy"; action: "download" | "email" }
  | { kind: "done"; message: string }
  | { kind: "error"; message: string };

function readSavedHub(): string {
  try {
    return window.localStorage.getItem(RETURN_HUB_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

function saveHub(value: string): void {
  try {
    window.localStorage.setItem(RETURN_HUB_STORAGE_KEY, value);
  } catch {
    // Best-effort convenience only.
  }
}

const fieldStyle = {
  padding: "0.5rem 0.625rem",
  borderRadius: "0.5rem",
  border: "1px solid #d1d5db",
  font: "inherit",
} as const;
const labelStyle = { display: "flex", flexDirection: "column", gap: "0.25rem" } as const;
const labelTextStyle = { fontSize: "0.8125rem", fontWeight: 600 } as const;
const errorStyle = { color: "#dc2626", fontSize: "0.75rem" } as const;

export function ReturnLabelModal({
  open,
  orderId,
  buyerAddress,
  onClose,
  generatePdf = generateReturnLabelPdf,
  emailToBuyer = emailReturnLabelToBuyer,
  download = downloadBlob,
}: ReturnLabelModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap({ containerRef: panelRef, isActive: open, onEscape: onClose });

  const [carrier, setCarrier] = useState<ReturnLabelCarrier>("usps");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [hubAddress, setHubAddress] = useState("");
  const [fromAddress, setFromAddress] = useState(buyerAddress);
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  useEffect(() => {
    if (!open) return;
    setHubAddress(readSavedHub());
    setFromAddress(buyerAddress);
    setTrackingNumber("");
    setStatus({ kind: "idle" });
  }, [open, orderId, buyerAddress]);

  const config: ReturnLabelConfig = useMemo(
    () => ({
      orderId,
      buyerAddress: fromAddress,
      merchantHubAddress: hubAddress,
      trackingNumber,
      carrier,
    }),
    [orderId, fromAddress, hubAddress, trackingNumber, carrier]
  );
  const errors = useMemo(() => validateReturnLabelConfig(config), [config]);
  const valid = Object.keys(errors).length === 0;

  if (!open) return null;

  const busy = status.kind === "busy";

  async function run(action: "download" | "email") {
    if (!valid) return;
    setStatus({ kind: "busy", action });
    try {
      const pdf = await generatePdf(config);
      saveHub(config.merchantHubAddress);
      if (action === "download") {
        download(returnLabelFilename(config), pdf);
        setStatus({ kind: "done", message: "Label downloaded." });
      } else {
        await emailToBuyer(config, pdf);
        setStatus({ kind: "done", message: "Label emailed to the buyer." });
      }
    } catch (err) {
      setStatus({
        kind: "error",
        message: err instanceof Error ? err.message : "Could not create the label.",
      });
    }
  }

  // Only flag fields the merchant has started on, so the empty form isn't red.
  const showTrackingError = trackingNumber.trim() !== "" && errors.trackingNumber;
  const showHubError = hubAddress.trim() !== "" && errors.merchantHubAddress;

  return (
    <div
      role="presentation"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        overflowY: "auto",
        zIndex: 1000,
        padding: "1rem",
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="return-label-modal-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff",
          borderRadius: "0.75rem",
          padding: "1.25rem",
          width: "100%",
          maxWidth: 760,
          display: "flex",
          flexWrap: "wrap",
          gap: "1.25rem",
        }}
      >
        <div style={{ flex: "1 1 300px", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <h2 id="return-label-modal-title" style={{ margin: 0, fontSize: "1.125rem" }}>
            Return shipping label
          </h2>
          <p style={{ margin: 0, fontSize: "0.75rem", color: "#6b7280" }}>
            Order {orderId}
          </p>

          <label style={labelStyle}>
            <span style={labelTextStyle}>Carrier</span>
            <select
              value={carrier}
              onChange={(e) => setCarrier(e.target.value as ReturnLabelCarrier)}
              style={fieldStyle}
            >
              {RETURN_LABEL_CARRIERS.map((id) => (
                <option key={id} value={id}>
                  {CARRIERS[id].name}
                </option>
              ))}
            </select>
          </label>

          <label style={labelStyle}>
            <span style={labelTextStyle}>Tracking number</span>
            <input
              type="text"
              value={trackingNumber}
              onChange={(e) => setTrackingNumber(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              aria-invalid={!!showTrackingError}
              style={fieldStyle}
            />
          </label>
          {showTrackingError && <span style={errorStyle}>{errors.trackingNumber}</span>}

          <label style={labelStyle}>
            <span style={labelTextStyle}>Return hub address</span>
            <textarea
              rows={3}
              value={hubAddress}
              onChange={(e) => setHubAddress(e.target.value)}
              placeholder={"Returns Dept.\n12 Warehouse Rd\nLagos 100001"}
              aria-invalid={!!showHubError}
              style={{ ...fieldStyle, resize: "vertical" }}
            />
          </label>
          {showHubError && <span style={errorStyle}>{errors.merchantHubAddress}</span>}

          <label style={labelStyle}>
            <span style={labelTextStyle}>Buyer address (ship from)</span>
            <textarea
              rows={2}
              value={fromAddress}
              onChange={(e) => setFromAddress(e.target.value)}
              style={{ ...fieldStyle, resize: "vertical" }}
            />
          </label>

          {status.kind === "error" && (
            <div role="alert" style={{ ...errorStyle, fontSize: "0.8125rem" }}>
              {status.message}
            </div>
          )}
          <span role="status" aria-live="polite" style={{ fontSize: "0.8125rem", color: "#047857" }}>
            {status.kind === "done" ? status.message : ""}
          </span>

          <div className="no-print" style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
            <Button
              type="button"
              variant="primary"
              disabled={!valid || busy}
              onClick={() => void run("download")}
            >
              {busy && status.action === "download" ? "Preparing…" : "Download Label"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={!valid || busy}
              onClick={() => void run("email")}
            >
              {busy && status.action === "email" ? "Sending…" : "Email to Buyer"}
            </Button>
            <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
              Close
            </Button>
          </div>
        </div>

        <div style={{ flex: "1 1 280px" }}>
          {valid ? (
            <ReturnShippingLabelPDF config={config} />
          ) : (
            <div
              style={{
                aspectRatio: "4 / 6",
                maxWidth: "4in",
                margin: "0 auto",
                border: "1px dashed #d1d5db",
                borderRadius: "0.5rem",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "1rem",
                textAlign: "center",
                color: "#6b7280",
                fontSize: "0.8125rem",
              }}
            >
              Enter a tracking number and return hub address to preview the label.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default ReturnLabelModal;
