"use client";

import { usePendingApprovals } from "../../hooks/usePendingApprovals";

/**
 * ApprovalsBadge (#780)
 *
 * Inline pill counter shown next to the Approvals nav link. Derives the
 * pending count from `usePendingApprovals` — the same polling hook used by
 * the dashboard — so the count stays live without any extra fetch.
 *
 * Renders nothing (null) when there are zero pending items so nav links
 * stay clean in the happy path.
 */
export function ApprovalsBadge() {
  const { count } = usePendingApprovals();

  if (count === 0) return null;

  const label = count > 99 ? "99+" : String(count);

  return (
    <span
      className="nav-badge"
      aria-label={`${count} pending approval${count === 1 ? "" : "s"}`}
      data-testid="approvals-badge"
    >
      {label}
    </span>
  );
}
