import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

vi.mock("../../components/wallet/public", () => ({
  WalletConnectButton: () => <button>Connect Wallet</button>,
}));

import OnboardingPage from "./page";
import {
  DEFAULT_ONBOARDING_LIMITS,
  ONBOARDING_LIMITS_STORAGE_KEY,
} from "../../lib/onboardingLimits";

function goToLimitsStep() {
  render(<OnboardingPage />);
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  expect(screen.getByRole("button", { name: "Connect Wallet" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
}

describe("OnboardingPage", () => {
  beforeEach(() => {
    window.localStorage.clear();
    push.mockClear();
  });

  it("embeds the wallet button and persists chosen limits on completion", () => {
    goToLimitsStep();

    const perTransaction = screen.getByLabelText(
      "Per-transaction limit"
    ) as HTMLInputElement;
    const daily = screen.getByLabelText(
      "Daily spending limit"
    ) as HTMLInputElement;
    expect(perTransaction.value).toBe("100");
    expect(daily.value).toBe("500");

    fireEvent.change(perTransaction, { target: { value: "20" } });
    fireEvent.change(daily, { target: { value: "40" } });

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Get Started" }));

    expect(
      JSON.parse(window.localStorage.getItem(ONBOARDING_LIMITS_STORAGE_KEY)!)
    ).toEqual({
      maxPerTransactionStroops: "200000000",
      dailyLimitStroops: "400000000",
    });
    expect(window.localStorage.getItem("delego_onboarding_complete")).toBe(
      "true"
    );
    expect(push).toHaveBeenCalledWith("/");
  });

  it("restores previously saved limits", () => {
    window.localStorage.setItem(
      ONBOARDING_LIMITS_STORAGE_KEY,
      JSON.stringify({
        maxPerTransactionStroops: "300000000",
        dailyLimitStroops: "900000000",
      })
    );

    goToLimitsStep();

    expect(
      (screen.getByLabelText("Per-transaction limit") as HTMLInputElement).value
    ).toBe("30");
    expect(
      (screen.getByLabelText("Daily spending limit") as HTMLInputElement).value
    ).toBe("90");
  });

  it("blocks navigation when the daily limit is below a single transaction", () => {
    goToLimitsStep();

    fireEvent.change(screen.getByLabelText("Per-transaction limit"), {
      target: { value: "100" },
    });
    fireEvent.change(screen.getByLabelText("Daily spending limit"), {
      target: { value: "50" },
    });

    expect(screen.getByRole("alert").textContent).toContain(
      "daily limit must be at least"
    );
    expect(
      (screen.getByRole("button", { name: "Next" }) as HTMLButtonElement).disabled
    ).toBe(true);
  });

  it("persists the default limits when the user skips", () => {
    render(<OnboardingPage />);
    fireEvent.click(screen.getByRole("button", { name: "Skip" }));

    expect(
      JSON.parse(window.localStorage.getItem(ONBOARDING_LIMITS_STORAGE_KEY)!)
    ).toEqual(DEFAULT_ONBOARDING_LIMITS);
    expect(push).toHaveBeenCalledWith("/");
  });
});
