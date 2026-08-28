"use client";

import { useState } from "react";
import type { IssueCategory, IssueStatus, Order, OrderIssue, ReportOrderIssuePayload } from "@delego/types";
import { Button, Card, Chip, Input, Select, TextArea } from "@delego/ui";
import { api } from "../../lib/api";

const ISSUE_CATEGORY_OPTIONS: Array<{ value: IssueCategory; label: string }> = [
  { value: "late", label: "Delivery is late" },
  { value: "damaged", label: "Item arrived damaged" },
  { value: "not_received", label: "Item not received" },
  { value: "other", label: "Other problem" },
];

export function issueStatusToChipVariant(
  status: IssueStatus
): "issue_open" | "issue_resolved" | "issue_escalated" {
  switch (status) {
    case "OPEN":
      return "issue_open";
    case "RESOLVED":
      return "issue_resolved";
    case "ESCALATED":
      return "issue_escalated";
  }
}

export function issueStatusLabel(status: IssueStatus): string {
  switch (status) {
    case "OPEN":
      return "Issue Open";
    case "RESOLVED":
      return "Issue Resolved";
    case "ESCALATED":
      return "Issue Escalated to Dispute";
  }
}

export interface ReportIssueFormProps {
  orderId: string;
  onSuccess?: (issue: OrderIssue) => void;
  onCancel?: () => void;
}

export function ReportIssueForm({ orderId, onSuccess, onCancel }: ReportIssueFormProps) {
  const [category, setCategory] = useState<IssueCategory | "">("");
  const [message, setMessage] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!category) {
      setError("Please select a category");
      return;
    }

    const payload: ReportOrderIssuePayload = {
      orderId,
      category: category as IssueCategory,
    };
    if (message.trim()) payload.message = message.trim();
    if (photoUrl.trim()) payload.photoUrl = photoUrl.trim();

    setSubmitting(true);
    try {
      const res = await api.reportOrderIssue(payload);
      if (res.error) {
        setError(res.error.message);
      } else if (res.data) {
        onSuccess?.(res.data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to report issue");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card title="Report a problem with this order">
      <form
        onSubmit={handleSubmit}
        style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
      >
        <p style={{ margin: 0, fontSize: "0.875rem", color: "#6b7280" }}>
          Start here before opening a formal dispute. Most issues are resolved
          directly with the seller within 2 business days.
        </p>

        <Select
          label="What's the problem?"
          placeholder="Select a category"
          value={category}
          options={ISSUE_CATEGORY_OPTIONS}
          onChange={(v) => setCategory(v as IssueCategory)}
          required
        />

        <TextArea
          label="Describe the issue (optional)"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Please share details that will help the seller resolve this quickly."
          hint="Max 500 characters"
          maxLength={500}
        />

        <Input
          label="Photo or evidence URL (optional)"
          type="url"
          value={photoUrl}
          onChange={(e) => setPhotoUrl(e.target.value)}
          placeholder="https://..."
          hint="Link to a hosted image or document"
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
          <Button type="submit" variant="primary" disabled={submitting || !category}>
            {submitting ? "Submitting…" : "Submit report"}
          </Button>
        </div>
      </form>
    </Card>
  );
}

export interface IssueBadgeProps {
  issue: OrderIssue;
}

export function IssueBadge({ issue }: IssueBadgeProps) {
  return (
    <Chip variant={issueStatusToChipVariant(issue.status)}>
      {issueStatusLabel(issue.status)}
    </Chip>
  );
}

function daysSince(iso: Date | string): number {
  const t = iso instanceof Date ? iso.getTime() : new Date(iso).getTime();
  return Math.max(0, Math.floor((Date.now() - t) / 86_400_000));
}

export interface IssuePanelProps {
  order: Order;
  issue: OrderIssue;
  onEscalateToDispute: (prefill: {
    category: IssueCategory;
    message: string;
    issueId: string;
  }) => void;
}

export function IssuePanel({ order, issue, onEscalateToDispute }: IssuePanelProps) {
  const daysOld = daysSince(issue.reportedAt);
  const daysUntilEscalation = Math.max(0, issue.escalationDays - daysOld);
  const canEscalate = daysUntilEscalation === 0 && issue.status === "OPEN";

  return (
    <Card title={`Reported issue: ${ISSUE_CATEGORY_OPTIONS.find((o) => o.value === issue.category)?.label ?? issue.category}`}>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <IssueBadge issue={issue} />
          <span style={{ fontSize: "0.75rem", color: "#6b7280" }}>
            Reported {daysOld === 0 ? "today" : `${daysOld}d ago`}
          </span>
        </div>

        {issue.message && (
          <p
            style={{
              margin: 0,
              padding: "0.75rem",
              background: "#f9fafb",
              borderRadius: "0.375rem",
              fontSize: "0.875rem",
              color: "#374151",
              whiteSpace: "pre-wrap",
            }}
          >
            {issue.message}
          </p>
        )}

        {issue.photoUrl && (
          <a
            href={issue.photoUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: "0.8125rem", color: "#2563eb" }}
          >
            View attached evidence ↗
          </a>
        )}

        {issue.status === "OPEN" && (
          <div
            style={{
              marginTop: "0.25rem",
              padding: "0.75rem 1rem",
              borderRadius: "0.5rem",
              background: canEscalate ? "#fef2f2" : "#fffbeb",
              border: `1px solid ${canEscalate ? "#fecaca" : "#fde68a"}`,
            }}
          >
            {canEscalate ? (
              <>
                <p
                  style={{
                    margin: "0 0 0.5rem",
                    fontSize: "0.875rem",
                    color: "#991b1b",
                    fontWeight: 500,
                  }}
                >
                  This issue has been open for {daysOld} days without
                  resolution. You can escalate to a formal dispute now.
                </p>
                <Button
                  type="button"
                  variant="primary"
                  onClick={() =>
                    onEscalateToDispute({
                      category: issue.category,
                      message:
                        issue.message ??
                        `Escalated from order issue #${issue.id} (category: ${issue.category})`,
                      issueId: issue.id,
                    })
                  }
                >
                  Escalate to formal dispute
                </Button>
              </>
            ) : (
              <p style={{ margin: 0, fontSize: "0.8125rem", color: "#92400e" }}>
                This issue is still within the{" "}
                <strong>{issue.escalationDays}-day</strong> resolution window.
                You can escalate to a formal dispute in{" "}
                <strong>{daysUntilEscalation} day{daysUntilEscalation === 1 ? "" : "s"}</strong>
                {" "}if it remains unresolved.
              </p>
            )}
          </div>
        )}

        {issue.status === "ESCALATED" && issue.escalatedAt && (
          <p style={{ margin: 0, fontSize: "0.8125rem", color: "#6b7280" }}>
            Escalated to formal dispute on{" "}
            {new Date(issue.escalatedAt).toLocaleDateString()}.
          </p>
        )}

        {issue.status === "RESOLVED" && issue.resolvedAt && (
          <p style={{ margin: 0, fontSize: "0.8125rem", color: "#065f46" }}>
            Resolved on {new Date(issue.resolvedAt).toLocaleDateString()}.
          </p>
        )}

        {order.escrowContractId && (
          <input
            type="hidden"
            name="escrowContractId"
            value={order.escrowContractId}
            readOnly
          />
        )}
      </div>
    </Card>
  );
}
