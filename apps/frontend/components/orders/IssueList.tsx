import { Card } from "@delego/ui";
import type { OrderIssue } from "@delego/types";
import { IssueStatusChip } from "./IssueStatusChip";
import { EscalateToDisputeCta } from "./EscalateToDisputeCta";
import { ISSUE_CATEGORY_LABEL } from "./categoryOptions";

export function IssueList({ issues }: { issues: OrderIssue[] }) {
  if (issues.length === 0) {
    return <p style={{ color: "var(--color-text-muted)" }}>No issues reported for this order.</p>;
  }

  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      {issues.map((issue) => (
        <li key={issue.id}>
          <Card>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.75rem" }}>
              <div>
                <strong>{ISSUE_CATEGORY_LABEL[issue.category]}</strong>
                {issue.message && (
                  <p style={{ margin: "0.25rem 0 0", color: "var(--color-text-muted)" }}>{issue.message}</p>
                )}
              </div>
              <IssueStatusChip status={issue.status} />
            </div>
            <div style={{ marginTop: "0.75rem" }}>
              <EscalateToDisputeCta issue={issue} />
            </div>
          </Card>
        </li>
      ))}
    </ul>
  );
}
