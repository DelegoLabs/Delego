"use client";

import { useState } from "react";
import type {
  DisputeCategory,
  EscalateIssueToDisputePayload,
  OrderDispute,
} from "@delego/types";
import { Button, Card, Input, Select, TextArea } from "@delego/ui";
import { api } from "../../lib/api";

const DISPUTE_CATEGORY_OPTIONS: Array<{ value: DisputeCategory; label: string }> = [
  { value: "late", label: "Delivery is late" },
  { value: "damaged", label: "Item arrived damaged" },
  { value: "not_received", label: "Item not received" },
  { value: "fraud", label: "Suspected fraud" },
  { value: "other", label: "Other dispute" },
];

export interface DisputePrefill {
  category?: DisputeCategory;
  message?: string;
  issueId?: string;
}

export interface DisputeFormProps {
  orderId: string;
  escrowId: string;
  prefill?: DisputePrefill;
  onSuccess?: (dispute: OrderDispute) => void;
  onCancel?: () => void;
}

export function DisputeForm({
  orderId,
  escrowId,
  prefill,
  onSuccess,
  onCancel,
}: DisputeFormProps) {
  const [category, setCategory] = useState<DisputeCategory | "">(
    prefill?.category ?? ""
  );
  const [message, setMessage] = useState(prefill?.message ?? "");
  const [evidenceUrls, setEvidenceUrls] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!category) {
      setError("Please select a dispute category");
      return;
    }
    if (!message.trim()) {
      setError("Please describe the dispute");
      return;
    }

    const evidenceArray = evidenceUrls
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);

    const payload: EscalateIssueToDisputePayload = {
      issueId: prefill?.issueId ?? "",
      orderId,
      escrowId,
      additionalNotes: message.trim(),
      additionalEvidenceUrls: evidenceArray.length ? evidenceArray : undefined,
    };

    setSubmitting(true);
    try {
      const res = await api.escalateIssueToDispute(payload);
      if (res.error) {
        setError(res.error.message);
      } else if (res.data) {
        onSuccess?.(res.data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to open dispute");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card title="Open a formal dispute">
      <form
        onSubmit={handleSubmit}
        style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
      >
        <p style={{ margin: 0, fontSize: "0.875rem", color: "#6b7280" }}>
          A formal dispute triggers a platform review. Please provide evidence
          so our team can adjudicate fairly.
        </p>

        {prefill?.issueId && (
          <div
            style={{
              padding: "0.5rem 0.75rem",
              borderRadius: "0.375rem",
              background: "#eff6ff",
              border: "1px solid #bfdbfe",
              fontSize: "0.8125rem",
              color: "#1e40af",
            }}
          >
            Pre-filled from issue report #{prefill.issueId}. You may edit the
            details below before submitting.
          </div>
        )}

        <Select
          label="Dispute reason"
          placeholder="Select a reason"
          value={category}
          options={DISPUTE_CATEGORY_OPTIONS}
          onChange={(v) => setCategory(v as DisputeCategory)}
          required
        />

        <TextArea
          label="Describe the dispute"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Provide a detailed description of the dispute."
          hint="Minimum 20 characters"
          minLength={20}
          required
          rows={5}
        />

        <TextArea
          label="Evidence URLs (optional — one per line)"
          value={evidenceUrls}
          onChange={(e) => setEvidenceUrls(e.target.value)}
          placeholder={"https://evidence-1.jpg\nhttps://evidence-2.pdf"}
          hint="Links to photos, receipts, or chat logs"
          rows={3}
        />

        <Input
          label="Order ID"
          value={orderId}
          readOnly
          disabled
        />

        <Input
          label="Escrow ID"
          value={escrowId}
          readOnly
          disabled
        />

        {error && (
          <div
            role="alert"
            style={{
              padding: "0.5rem 0.75rem",
              borderRadius: "0.375rem",
              background: "#fef2f2",
              color: "#991b1b",
              fontSize: "0.875rem",
            }}
          >
            {error}
          </div>
        )}

        <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
          {onCancel && (
            <Button
              type="button"
              variant="ghost"
              onClick={onCancel}
              disabled={submitting}
            >
              Cancel
            </Button>
          )}
          <Button
            type="submit"
            variant="primary"
            disabled={submitting || !category || message.trim().length < 20}
          >
            {submitting ? "Opening dispute…" : "Open dispute"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
