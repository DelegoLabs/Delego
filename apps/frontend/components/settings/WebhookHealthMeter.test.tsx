import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import enMessages from "../../messages/en.json";
import { WebhookHealthMeter, type WebhookHealthMeterProps } from "./WebhookHealthMeter";
import type { WebhookHealthScore } from "../../lib/webhookHealth";

const ENDPOINT = "https://merchant.example.com/hooks";

function score(overrides: Partial<WebhookHealthScore> = {}): WebhookHealthScore {
  return {
    endpointId: ENDPOINT,
    successRatePercentage: 99.5,
    totalAttempts7d: 200,
    consecutiveFailures: 0,
    healthTier: "healthy",
    ...overrides,
  };
}

const ERRORS: WebhookHealthMeterProps["recentErrors"] = [
  { httpStatus: 504, label: "504 Gateway Timeout", deliveredAt: new Date("2026-03-10T11:00:00Z") },
  { httpStatus: 500, label: "500 Internal Server Error", deliveredAt: new Date("2026-03-10T09:00:00Z") },
];

function renderMeter(props: Partial<WebhookHealthMeterProps> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages} timeZone="UTC">
      <WebhookHealthMeter score={score()} recentErrors={[]} {...props} />
    </NextIntlClientProvider>
  );
}

describe("WebhookHealthMeter", () => {
  it("shows the success rate as a 0–100 meter with a healthy badge", () => {
    renderMeter();
    const meter = screen.getByRole("meter", { name: "7-day delivery success rate" });
    expect(meter).toHaveAttribute("aria-valuemin", "0");
    expect(meter).toHaveAttribute("aria-valuemax", "100");
    expect(meter).toHaveAttribute("aria-valuenow", "99.5");
    expect(screen.getByText("Healthy · 99.5%")).toBeInTheDocument();
    expect(screen.getByText("200 delivery attempts")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("shows an amber degraded warning for the warning tier", () => {
    renderMeter({
      score: score({ successRatePercentage: 97.96, healthTier: "warning", consecutiveFailures: 1 }),
      recentErrors: ERRORS,
    });
    expect(screen.getByText("Degraded · 97.9%")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Some deliveries to this endpoint are failing.");
    expect(screen.getByText(/1 consecutive failure$/)).toBeInTheDocument();
  });

  it("shows a prominent critical alert for unhealthy endpoints", () => {
    renderMeter({
      score: score({ successRatePercentage: 62.5, healthTier: "critical", consecutiveFailures: 4 }),
      recentErrors: ERRORS,
    });
    expect(screen.getByText("Critical · 62.5%")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("This endpoint is failing too many deliveries.");
  });

  it("lists the most recent HTTP error codes in a tooltip on focus, dismissible with Escape", async () => {
    const user = userEvent.setup();
    renderMeter({
      score: score({ successRatePercentage: 80, healthTier: "critical" }),
      recentErrors: ERRORS,
    });
    const tooltip = screen.getByRole("tooltip", { hidden: true });
    expect(tooltip).toHaveStyle({ visibility: "hidden" });

    await user.tab();
    const trigger = screen.getByRole("button", { name: "Recent errors" });
    expect(trigger).toHaveFocus();
    expect(trigger).toHaveAccessibleDescription(/504 Gateway Timeout.*500 Internal Server Error/);
    expect(tooltip).toHaveStyle({ visibility: "visible" });

    await user.keyboard("{Escape}");
    expect(tooltip).toHaveStyle({ visibility: "hidden" });
  });

  it("shows a no-data message instead of a score when there were no attempts", () => {
    renderMeter({ score: score({ successRatePercentage: 100, totalAttempts7d: 0 }) });
    expect(screen.getByText("No deliveries to this endpoint in the last 7 days.")).toBeInTheDocument();
    expect(screen.queryByRole("meter")).not.toBeInTheDocument();
  });
});
