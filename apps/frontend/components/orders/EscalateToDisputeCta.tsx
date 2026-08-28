"use client";

import Link from "next/link";
import { Button } from "@delego/ui";
import type { OrderIssue } from "@delego/types";

/** Days an issue may sit unresolved before the escalate CTA appears */
export const ESCALATION_THRESHOLD_DAYS = 3;

function daysSince(date: Date): number {
  return (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24);
}

export function isEscalationEligible(issue: OrderIssue): boolean {
  const unresolved = issue.status === "open" || issue.status === "acknowledged";
  return unresolved && daysSince(issue.createdAt) >= ESCALATION_THRESHOLD_DAYS;
}

/** Builds the deep-link into the formal dispute flow, pre-filling the issue's category and message */
export function buildEscalationHref(issue: OrderIssue): string {
  const params = new URLSearchParams({
    orderId: issue.orderId,
    issueId: issue.id,
    category: issue.category,
    message: issue.message ?? "",
  });
  return `/disputes/new?${params.toString()}`;
}

export interface EscalateToDisputeCtaProps {
  issue: OrderIssue;
}

export function EscalateToDisputeCta({ issue }: EscalateToDisputeCtaProps) {
  if (!isEscalationEligible(issue)) {
    return null;
  }

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "0.75rem",
        padding: "0.75rem 1rem",
        borderRadius: "0.375rem",
        border: "1px solid var(--chip-warning-fg)",
        background: "var(--chip-warning-bg)",
        color: "var(--chip-warning-fg)",
      }}
    >
      <span>
        This issue has been open for {Math.floor(daysSince(issue.createdAt))}+ days without resolution.
      </span>
      <Link href={buildEscalationHref(issue)} style={{ textDecoration: "none" }}>
        <Button variant="primary">Escalate to formal dispute</Button>
      </Link>
    </div>
  );
}
