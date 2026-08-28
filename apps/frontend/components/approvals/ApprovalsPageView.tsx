"use client";

import { Card } from "@delego/ui";
import { useApprovals, useBulkUpdateApprovals } from "../../hooks/useApprovals";
import { ApprovalsList } from "./ApprovalsList";

export function ApprovalsPageView() {
  const { data: approvals, isLoading, error } = useApprovals();
  const bulkUpdate = useBulkUpdateApprovals();

  return (
    <main className="container">
      <header className="header">
        <h1>Approvals</h1>
        <p>Review and act on pending requests.</p>
      </header>

      <Card>
        {isLoading && <p>Loading approvals...</p>}
        {error && <p role="alert">Could not load approvals.</p>}
        {approvals && (
          <ApprovalsList
            approvals={approvals}
            onBulkApprove={(ids) => bulkUpdate.mutate({ ids, status: "approved" })}
            onBulkReject={(ids) => bulkUpdate.mutate({ ids, status: "rejected" })}
          />
        )}
      </Card>
    </main>
  );
}
