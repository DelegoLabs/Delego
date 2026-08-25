import { describe, it, expect } from "vitest";
import type { SpendPreviewReason } from "@delego/types";
import { remediationForReason } from "./spendPreview";

describe("remediationForReason", () => {
  const cases: Array<[SpendPreviewReason, string | null]> = [
    ["per_tx_limit", "editLimits"],
    ["total_limit", "editLimits"],
    ["bad_merchant", "editMerchants"],
    ["paused", "resume"],
    ["expired", "renew"],
    ["not_found", null],
    ["unauthorized", null],
    ["ok", null],
  ];

  it.each(cases)("maps reason %s to action %s", (reason, expectedAction) => {
    const remediation = remediationForReason(reason);
    if (expectedAction === null) {
      expect(remediation).toBeNull();
    } else {
      expect(remediation?.action).toBe(expectedAction);
      expect(remediation?.actionLabel).toBeTruthy();
      expect(remediation?.constraint).toBeTruthy();
    }
  });

  it("gives cap denials (both per-tx and total) the same remediation action", () => {
    expect(remediationForReason("per_tx_limit")?.action).toBe("editLimits");
    expect(remediationForReason("total_limit")?.action).toBe("editLimits");
  });

  it("gives every non-null reason a distinct constraint label", () => {
    const reasons: SpendPreviewReason[] = ["per_tx_limit", "total_limit", "bad_merchant", "paused", "expired"];
    const labels = reasons.map((r) => remediationForReason(r)?.constraint);
    expect(new Set(labels).size).toBe(labels.length);
  });
});
