"use client";

import { useState, type FormEvent } from "react";
import { Button, Select } from "@delego/ui";
import type { IssueCategory } from "@delego/types";
import { useReportOrderIssue } from "../../hooks/useReportOrderIssue";
import { ISSUE_CATEGORY_OPTIONS } from "./categoryOptions";

export interface ReportProblemFormProps {
  orderId: string;
  onSuccess?: () => void;
  onCancel?: () => void;
}

/** Lightweight "report a problem" form. Submits an OrderIssue — never a Dispute. */
export function ReportProblemForm({ orderId, onSuccess, onCancel }: ReportProblemFormProps) {
  const [category, setCategory] = useState<IssueCategory>("late");
  const [message, setMessage] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const { mutate, isPending, error } = useReportOrderIssue(orderId);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    mutate(
      {
        category,
        message: message.trim() || undefined,
        photoUrl: photoUrl.trim() || undefined,
      },
      { onSuccess: () => onSuccess?.() }
    );
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      <Select
        label="What went wrong?"
        options={ISSUE_CATEGORY_OPTIONS}
        value={category}
        onChange={(e) => setCategory(e.target.value as IssueCategory)}
      />
      <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
        <label htmlFor="report-problem-message" style={{ fontSize: "0.875rem", fontWeight: 500 }}>
          Message (optional)
        </label>
        <textarea
          id="report-problem-message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={3}
          maxLength={2000}
          style={{
            padding: "0.5rem 0.75rem",
            borderRadius: "0.375rem",
            border: "1px solid var(--color-border)",
            background: "var(--color-surface)",
            color: "var(--color-text)",
            font: "inherit",
            resize: "vertical",
          }}
        />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
        <label htmlFor="report-problem-photo" style={{ fontSize: "0.875rem", fontWeight: 500 }}>
          Photo URL (optional)
        </label>
        <input
          id="report-problem-photo"
          type="url"
          value={photoUrl}
          onChange={(e) => setPhotoUrl(e.target.value)}
          placeholder="https://..."
          style={{
            padding: "0.5rem 0.75rem",
            borderRadius: "0.375rem",
            border: "1px solid var(--color-border)",
            background: "var(--color-surface)",
            color: "var(--color-text)",
            font: "inherit",
          }}
        />
      </div>
      {error && (
        <p role="alert" style={{ color: "var(--color-danger)", fontSize: "0.875rem", margin: 0 }}>
          {error instanceof Error ? error.message : "Something went wrong. Please try again."}
        </p>
      )}
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <Button type="submit" variant="primary" disabled={isPending}>
          {isPending ? "Submitting..." : "Submit report"}
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
