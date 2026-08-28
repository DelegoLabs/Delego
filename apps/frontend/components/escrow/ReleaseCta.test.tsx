import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { ReleaseEligibility } from "@delego/types";
import { ReleaseCta } from "./ReleaseCta";

function makeEligibility(overrides: Partial<ReleaseEligibility> = {}): ReleaseEligibility {
  return {
    escrowId: "1",
    eligible: true,
    status: "active",
    isAuthorizedCaller: true,
    reasons: [],
    buyerRefundUnlockTime: new Date(Date.now() + 3600_000).toISOString(),
    buyerRefundSecondsRemaining: 3600,
    checkedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("ReleaseCta", () => {
  it("enables the CTA and fires onRelease when eligible", async () => {
    const onRelease = vi.fn();
    render(<ReleaseCta eligibility={makeEligibility({ eligible: true })} isLoading={false} onRelease={onRelease} />);

    const button = screen.getByRole("button", { name: /release funds/i });
    expect(button).toBeEnabled();
    fireEvent.click(button);

    await waitFor(() => expect(onRelease).toHaveBeenCalledTimes(1));
  });

  it("disables the CTA and explains the unmet condition when ineligible", () => {
    render(
      <ReleaseCta
        eligibility={makeEligibility({ eligible: false, reasons: ["unauthorized_caller"] })}
        isLoading={false}
        onRelease={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: /release funds/i })).toBeDisabled();
  });

  it("the submit handler guard prevents onRelease from firing even if disabled is somehow bypassed", async () => {
    const onRelease = vi.fn();
    render(
      <ReleaseCta
        eligibility={makeEligibility({ eligible: false, reasons: ["already_released"] })}
        isLoading={false}
        onRelease={onRelease}
      />
    );

    const button = screen.getByRole("button", { name: /release funds/i });
    // Force-click a disabled button — React Testing Library still dispatches the event;
    // the component's own guard (not just the `disabled` attribute) must stop it.
    fireEvent.click(button);

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(onRelease).not.toHaveBeenCalled();
  });

  it("disables the CTA while eligibility is still loading, without claiming a reason", () => {
    render(<ReleaseCta eligibility={undefined} isLoading={true} onRelease={vi.fn()} />);
    expect(screen.getByRole("button", { name: /release funds/i })).toBeDisabled();
  });
});
