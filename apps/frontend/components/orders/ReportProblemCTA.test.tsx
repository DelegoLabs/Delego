/**
 * Tests for Issue 1: "Report a Problem" vs. Formal Dispute.
 *
 * Core invariants:
 *  1. IssueStatus and DisputeStatus enums are disjoint — no value overlap.
 *  2. An "issue open" chip never renders a dispute-adjacent class/attribute.
 *  3. The escalation deep-link carries category + message forward.
 *  4. The chip passes the contrast heuristic (data-issue-status present).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ReportProblemCTA } from "./ReportProblemCTA";
import {
  ISSUE_STATUSES,
  ISSUE_CATEGORY_LABELS,
  type IssueTicketRecord,
  buildEscalationUrl,
  isEscalationDue,
} from "../../lib/issueTicket";
// Dispute statuses come from lib/disputes to assert non-overlap.
import { DISPUTE_STATUS_LABELS } from "../../lib/disputes";

// ─── Enum disjointness ───────────────────────────────────────────────────────

describe("IssueStatus / DisputeStatus disjointness", () => {
  it("no ISSUE_STATUS value exists in DISPUTE_STATUS_LABELS keys", () => {
    const disputeKeys = new Set(Object.keys(DISPUTE_STATUS_LABELS));
    for (const issueStatus of ISSUE_STATUSES) {
      expect(disputeKeys.has(issueStatus)).toBe(false);
    }
  });

  it("ISSUE_STATUSES all start with 'issue_' prefix to make conflation impossible", () => {
    for (const s of ISSUE_STATUSES) {
      expect(s.startsWith("issue_")).toBe(true);
    }
  });
});

// ─── Chip rendering ──────────────────────────────────────────────────────────

const baseOrder = {
  id: "ord-001",
  merchantId: "merchant-a",
  delegationId: "del-001",
  escrowContractId: "esc-001",
  status: "escrowed" as const,
  totalStroops: 1_000_000n,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  lineItems: [],
} as any;

describe("ReportProblemCTA — existing ticket renders chip", () => {
  const ticket: IssueTicketRecord = {
    id: "iss-001",
    orderId: "ord-001",
    category: "late_delivery",
    status: "issue_open",
    reportedAt: new Date("2024-01-01"),
  };

  it("renders issue status chip with correct data attribute", () => {
    render(<ReportProblemCTA order={baseOrder} existingTicket={ticket} />);
    const chip = screen.getByTestId("issue-status-chip");
    expect(chip).toBeDefined();
    expect(chip.getAttribute("data-issue-status")).toBe("issue_open");
  });

  it("chip text is 'Issue open', not 'Disputed' or any dispute label", () => {
    render(<ReportProblemCTA order={baseOrder} existingTicket={ticket} />);
    const chip = screen.getByTestId("issue-status-chip");
    expect(chip.textContent).toBe("Issue open");
    // Sanity: dispute labels must not appear
    for (const label of Object.values(DISPUTE_STATUS_LABELS)) {
      expect(chip.textContent).not.toBe(label);
    }
  });

  it("shows category label in detail rows", () => {
    render(<ReportProblemCTA order={baseOrder} existingTicket={ticket} />);
    expect(
      screen.getByText(ISSUE_CATEGORY_LABELS["late_delivery"])
    ).toBeDefined();
  });
});

// ─── Escalation deep-link ────────────────────────────────────────────────────

describe("buildEscalationUrl", () => {
  it("carries category-derived reason and message forward", () => {
    const url = buildEscalationUrl("esc-001", {
      category: "not_received",
      message: "Still no package",
    });
    expect(url).toContain("reason=item_not_received");
    expect(url).toContain("description=Still+no+package");
    expect(url).toContain("_source=issue_escalation");
    expect(url).toContain("/escrows/esc-001");
  });

  it("omits description param when message is absent", () => {
    const url = buildEscalationUrl("esc-001", {
      category: "damaged",
      message: undefined,
    });
    expect(url).not.toContain("description=");
    expect(url).toContain("reason=not_as_described");
  });
});

describe("isEscalationDue", () => {
  it("returns false before threshold", () => {
    const now = new Date("2024-01-04T00:00:00Z");
    const reportedAt = new Date("2024-01-02T00:00:00Z"); // 2 days ago
    expect(isEscalationDue(reportedAt, now, 3)).toBe(false);
  });

  it("returns true at exactly the threshold", () => {
    const reportedAt = new Date("2024-01-01T00:00:00Z");
    const now = new Date("2024-01-04T00:00:00Z"); // exactly 3 days
    expect(isEscalationDue(reportedAt, now, 3)).toBe(true);
  });
});

// ─── Escalation banner appears in component ──────────────────────────────────

describe("ReportProblemCTA — escalation banner", () => {
  it("shows escalation deep-link for old unresolved tickets", () => {
    const oldTicket: IssueTicketRecord = {
      id: "iss-002",
      orderId: "ord-001",
      category: "not_received",
      message: "Where is my package?",
      status: "issue_open",
      reportedAt: new Date(Date.now() - 4 * 24 * 3600 * 1000), // 4 days ago
    };
    render(<ReportProblemCTA order={baseOrder} existingTicket={oldTicket} />);
    const link = screen.getByTestId("escalation-deeplink");
    expect(link).toBeDefined();
    expect(link.getAttribute("href")).toContain("reason=item_not_received");
    expect(link.getAttribute("href")).toContain(
      "description=Where+is+my+package%3F"
    );
  });

  it("does not show escalation banner for a recently-opened ticket", () => {
    const freshTicket: IssueTicketRecord = {
      id: "iss-003",
      orderId: "ord-001",
      category: "late_delivery",
      status: "issue_open",
      reportedAt: new Date(), // just now
    };
    render(<ReportProblemCTA order={baseOrder} existingTicket={freshTicket} />);
    expect(screen.queryByTestId("escalation-deeplink")).toBeNull();
  });
});
