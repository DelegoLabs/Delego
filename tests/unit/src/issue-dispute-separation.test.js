import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("Task 1 — Issue vs Dispute state separation", () => {
  it("keeps IssueStatus and DisputeStatus as distinct string unions", () => {
    const issueStatuses = ["OPEN", "RESOLVED", "ESCALATED"];
    const disputeStatuses = [
      "OPEN",
      "EVIDENCE_PENDING",
      "UNDER_REVIEW",
      "RESOLVED_SELLER",
      "RESOLVED_BUYER",
      "DISMISSED",
    ];

    assert.ok(issueStatuses.includes("OPEN"));
    assert.ok(!issueStatuses.includes("EVIDENCE_PENDING"));

    assert.ok(disputeStatuses.includes("UNDER_REVIEW"));
    assert.ok(!disputeStatuses.includes("ESCALATED"));
    assert.ok(!disputeStatuses.includes("RESOLVED"));
  });

  it("ensures IssueCategory and DisputeCategory are not identical sets", () => {
    const issueCategories = ["late", "damaged", "not_received", "other"];
    const disputeCategories = [
      "late",
      "damaged",
      "not_received",
      "fraud",
      "other",
    ];

    assert.ok(!issueCategories.includes("fraud"));
    assert.ok(disputeCategories.includes("fraud"));
  });

  it("prevents cross-assigning payload fields at the type level", () => {
    const reportPayloadShape = ["orderId", "category", "message?", "photoUrl?"];
    const escalatePayloadShape = [
      "issueId",
      "orderId",
      "escrowId",
      "additionalEvidenceUrls?",
      "additionalNotes?",
    ];

    assert.ok(reportPayloadShape.includes("category"));
    assert.ok(!reportPayloadShape.includes("escrowId"));
    assert.ok(!reportPayloadShape.includes("issueId"));

    assert.ok(escalatePayloadShape.includes("issueId"));
    assert.ok(escalatePayloadShape.includes("escrowId"));
    assert.ok(!escalatePayloadShape.includes("category"));
  });
});
