import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import type { OrderIssue } from "@delego/types";
import { EscalateToDisputeCta, isEscalationEligible, buildEscalationHref } from "./EscalateToDisputeCta";

function makeIssue(overrides: Partial<OrderIssue> = {}): OrderIssue {
  return {
    id: "issue-1",
    orderId: "order-1",
    reporterUserId: "user-1",
    category: "late",
    message: "Still waiting",
    photoUrl: null,
    status: "open",
    createdAt: new Date(),
    updatedAt: new Date(),
    resolvedAt: null,
    ...overrides,
  };
}

const TEN_DAYS_AGO = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);

describe("EscalateToDisputeCta", () => {
  it("does not render for a freshly reported issue", () => {
    const issue = makeIssue({ createdAt: new Date() });
    render(<EscalateToDisputeCta issue={issue} />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(isEscalationEligible(issue)).toBe(false);
  });

  it("does not render once the issue is resolved, even if old", () => {
    const issue = makeIssue({ createdAt: TEN_DAYS_AGO, status: "resolved" });
    render(<EscalateToDisputeCta issue={issue} />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("does not render once already escalated", () => {
    const issue = makeIssue({ createdAt: TEN_DAYS_AGO, status: "escalated" });
    render(<EscalateToDisputeCta issue={issue} />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("renders and deep-links with the issue's category and message pre-filled once unresolved past the threshold", () => {
    const issue = makeIssue({
      createdAt: TEN_DAYS_AGO,
      status: "open",
      category: "damaged",
      message: "Box was crushed",
    });
    render(<EscalateToDisputeCta issue={issue} />);

    const link = screen.getByRole("link", { name: /escalate to formal dispute/i });
    const href = link.getAttribute("href")!;
    const params = new URLSearchParams(href.split("?")[1]);

    expect(params.get("orderId")).toBe("order-1");
    expect(params.get("issueId")).toBe("issue-1");
    expect(params.get("category")).toBe("damaged");
    expect(params.get("message")).toBe("Box was crushed");
    // The deep link carries the issue's own fields, never a DisputeStatus value.
    expect(href).not.toContain("status=");
  });

  it("buildEscalationHref always targets the formal dispute route", () => {
    const issue = makeIssue({ createdAt: TEN_DAYS_AGO });
    expect(buildEscalationHref(issue)).toContain("/disputes/new?");
  });
});
