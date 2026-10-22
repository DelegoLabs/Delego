import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import enMessages from "../../messages/en.json";
import { VerificationStepper } from "./VerificationStepper";
import type { VerificationTierStatus } from "../../lib/merchantVerificationTiers";

function status(
  currentTier: VerificationTierStatus["currentTier"],
  completed: [boolean, boolean, boolean],
  links: (string | undefined)[] = []
): VerificationTierStatus {
  const names = ["Email address verified", "Business domain verified", "On-chain business entity verified"];
  return {
    currentTier,
    tierRequirements: names.map((name, i) => ({
      name,
      isCompleted: completed[i],
      ...(links[i] ? { verificationLink: links[i] } : {}),
    })),
  };
}

function renderStepper(s: VerificationTierStatus) {
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <VerificationStepper status={s} />
    </NextIntlClientProvider>
  );
}

function steps() {
  return within(screen.getByRole("list")).getAllByRole("listitem");
}

describe("VerificationStepper", () => {
  it("shows an unverified merchant with Tier 1 as the next step", () => {
    renderStepper(status(1, [false, false, false]));
    expect(screen.getByText("Not yet verified")).toBeInTheDocument();
    expect(screen.getByText("0 of 3 verifications complete")).toBeInTheDocument();
    const [tier1, tier2, tier3] = steps();
    expect(tier1).toHaveAttribute("aria-current", "step");
    expect(tier1).toHaveTextContent("Tier 1 · Bronze");
    expect(tier1).toHaveTextContent("Next step");
    expect(tier2).toHaveTextContent("Not started");
    expect(tier3).toHaveTextContent("Tier 3 · Gold Business");
  });

  it("shows the Bronze badge and a verified Tier 1 once email is verified", () => {
    renderStepper(status(1, [true, false, false], [undefined, "/merchant/register"]));
    const header = screen.getByRole("heading", { name: "Verification tier" }).parentElement!.parentElement!;
    expect(within(header).getByText("Bronze")).toBeInTheDocument();
    const [tier1, tier2] = steps();
    expect(tier1).toHaveTextContent("Bronze verified");
    expect(tier1).not.toHaveAttribute("aria-current");
    expect(tier2).toHaveAttribute("aria-current", "step");
    expect(within(tier2).getByRole("link", { name: "Verify now: Business domain verified" })).toHaveAttribute(
      "href",
      "/merchant/register"
    );
  });

  it("shows Gold Business with every tier verified", () => {
    renderStepper(status(3, [true, true, true]));
    expect(screen.getByText("3 of 3 verifications complete")).toBeInTheDocument();
    expect(steps().map((s) => s.getAttribute("data-state"))).toEqual(["verified", "verified", "verified"]);
    expect(screen.getByText("Gold Business verified")).toBeInTheDocument();
    expect(screen.getByText("Silver verified")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("marks an out-of-order completion verified without awarding its tier badge", () => {
    renderStepper(status(1, [false, true, false]));
    const [tier1, tier2] = steps();
    expect(tier1).toHaveAttribute("aria-current", "step");
    expect(tier2).toHaveAttribute("data-state", "verified");
    expect(within(tier2).getByText("Verified")).toBeInTheDocument();
    expect(screen.queryByText("Silver verified")).not.toBeInTheDocument();
    expect(screen.getByText("Not yet verified")).toBeInTheDocument();
  });
});
