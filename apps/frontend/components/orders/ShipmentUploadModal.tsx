"use client";

import { useState } from "react";
import {
  SHIPPING_CARRIERS,
  isValidTrackingNumber,
  submitShipment,
  type ShippingCarrier,
} from "../../lib/shipments";

export interface ShipmentUploadModalProps {
  open: boolean;
  orderId: string;
  onClose: () => void;
  /** Called after a successful submission so the caller can refresh its order list. */
  onSubmitted: () => void;
}

/** Modal letting a merchant mark an order shipped with a carrier + tracking number. */
export function ShipmentUploadModal({ open, orderId, onClose, onSubmitted }: ShipmentUploadModalProps) {
  const [carrier, setCarrier] = useState<ShippingCarrier>("fedex");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [shippingNotes, setShippingNotes] = useState("");
  const [trackingError, setTrackingError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  async function handleSubmit() {
    if (!isValidTrackingNumber(carrier, trackingNumber)) {
      setTrackingError("That doesn't look like a valid tracking number for this carrier.");
      return;
    }
    setTrackingError(null);
    setSubmitError(null);
    setSubmitting(true);
    try {
      await submitShipment({ orderId, carrier, trackingNumber, shippingNotes });
      onSubmitted();
      onClose();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to submit shipment.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Upload tracking number"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 50,
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: "0.75rem",
          padding: "1.25rem",
          width: "100%",
          maxWidth: 420,
          display: "flex",
          flexDirection: "column",
          gap: "0.875rem",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ margin: 0 }}>Mark as shipped</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{ border: "none", background: "transparent", cursor: "pointer" }}
          >
            ✕
          </button>
        </div>

        <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
          <span style={{ fontSize: "0.8125rem", fontWeight: 600 }}>Carrier</span>
          <select
            value={carrier}
            onChange={(e) => {
              setCarrier(e.target.value as ShippingCarrier);
              setTrackingError(null);
            }}
            style={{ padding: "0.5rem 0.625rem", borderRadius: "0.5rem", border: "1px solid #d1d5db" }}
          >
            {SHIPPING_CARRIERS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
          <span style={{ fontSize: "0.8125rem", fontWeight: 600 }}>Tracking number</span>
          <input
            type="text"
            value={trackingNumber}
            onChange={(e) => {
              setTrackingNumber(e.target.value);
              setTrackingError(null);
            }}
            style={{
              padding: "0.5rem 0.625rem",
              borderRadius: "0.5rem",
              border: `1px solid ${trackingError ? "#dc2626" : "#d1d5db"}`,
            }}
          />
          {trackingError && (
            <span role="alert" style={{ fontSize: "0.75rem", color: "#dc2626" }}>
              {trackingError}
            </span>
          )}
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
          <span style={{ fontSize: "0.8125rem", fontWeight: 600 }}>Notes (optional)</span>
          <textarea
            value={shippingNotes}
            onChange={(e) => setShippingNotes(e.target.value)}
            rows={2}
            style={{ padding: "0.5rem 0.625rem", borderRadius: "0.5rem", border: "1px solid #d1d5db" }}
          />
        </label>

        {submitError && (
          <p role="alert" style={{ fontSize: "0.75rem", color: "#dc2626", margin: 0 }}>
            {submitError}
          </p>
        )}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          style={{
            padding: "0.625rem 1rem",
            borderRadius: "0.5rem",
            border: "none",
            background: "#2563eb",
            color: "#fff",
            fontWeight: 600,
            cursor: submitting ? "wait" : "pointer",
          }}
        >
          {submitting ? "Submitting…" : "Submit tracking info"}
        </button>
      </div>
    </div>
  );
}
