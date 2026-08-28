import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { IssueStatusChip } from "./IssueStatusChip";
import type { IssueStatus } from "@delego/types";

describe("IssueStatusChip", () => {
  it.each<[IssueStatus, string]>([
    ["open", "Issue Open"],
    ["acknowledged", "Issue Acknowledged"],
    ["resolved", "Issue Resolved"],
    ["escalated", "Escalated to Dispute"],
  ])("renders the correct label for status=%s", (status, label) => {
    render(<IssueStatusChip status={status} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it("never renders a DisputeStatus-style label such as 'Under Review' or 'Dispute Closed'", () => {
    render(<IssueStatusChip status="open" />);
    expect(screen.queryByText(/under review/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/dispute closed/i)).not.toBeInTheDocument();
  });
});
