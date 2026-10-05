"use client";

import { usePendingApprovalBadge } from "../../hooks/usePendingApprovalBadge";

/**
 * Pending-signature counter for the navigation link (#780).
 *
 * Renders nothing when there is no queue to action, so the nav stays quiet for
 * everyone whose team has no approvals waiting.
 */
export function NavPendingBadge() {
  const count = usePendingApprovalBadge();
  if (count <= 0) return null;
  return (
    <span
      className="nav-badge"
      data-testid="nav-pending-approvals-badge"
      aria-label={`${count} approvals awaiting your signature`}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}
