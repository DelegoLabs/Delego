"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Select } from "@delego/ui";
import type { IssueCategory } from "@delego/types";
import { useCreateDispute } from "../../hooks/useCreateDispute";
import { ISSUE_CATEGORY_OPTIONS, isIssueCategory } from "../orders/categoryOptions";

export interface DisputeNewFormProps {
  orderId: string;
  issueId?: string;
  initialCategory?: string;
  initialMessage?: string;
}

/** Formal dispute creation form. Pre-filled from an escalated OrderIssue, but submits a Dispute. */
export function DisputeNewForm({ orderId, issueId, initialCategory, initialMessage }: DisputeNewFormProps) {
  const router = useRouter();
  const [category, setCategory] = useState<IssueCategory>(
    isIssueCategory(initialCategory) ? initialCategory : "other"
  );
  const [message, setMessage] = useState(initialMessage ?? "");
  const { mutate, isPending, error } = useCreateDispute(orderId);

  if (!orderId) {
    return (
      <main className="container">
        <p>Missing order. Start a dispute from an order&apos;s detail page.</p>
      </main>
    );
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    mutate(
      { category, message, issueId },
      { onSuccess: () => router.push(`/orders/${orderId}`) }
    );
  }

  return (
    <main className="container">
      <header className="header">
        <h1>File a formal dispute</h1>
        <p>{issueId ? "Pre-filled from your reported issue." : "Describe what went wrong with this order."}</p>
      </header>
      <Card>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <Select
            label="Category"
            options={ISSUE_CATEGORY_OPTIONS}
            value={category}
            onChange={(e) => setCategory(e.target.value as IssueCategory)}
          />
          <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
            <label htmlFor="dispute-message" style={{ fontSize: "0.875rem", fontWeight: 500 }}>
              Message
            </label>
            <textarea
              id="dispute-message"
              required
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={5}
              maxLength={4000}
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
          {error && (
            <p role="alert" style={{ color: "var(--color-danger)", fontSize: "0.875rem", margin: 0 }}>
              {error instanceof Error ? error.message : "Something went wrong. Please try again."}
            </p>
          )}
          <div>
            <Button type="submit" variant="primary" disabled={isPending}>
              {isPending ? "Submitting..." : "Submit dispute"}
            </Button>
          </div>
        </form>
      </Card>
    </main>
  );
}
