import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import enMessages from "../../messages/en.json";
import { MerchantWebhookCard } from "./MerchantWebhookCard";
import { WEBHOOK_LOG_STORAGE_KEY } from "../../lib/webhookDeliveryLog";

const ENDPOINT = "https://merchant.example.com/hooks";

function storeConfig(isActive: boolean) {
  window.localStorage.setItem(
    "delego_merchant_webhook_config",
    JSON.stringify({ webhookUrl: ENDPOINT, secretKey: "abc", subscribedEvents: [], isActive })
  );
}

function storeDeliveries(statuses: number[]) {
  const now = Date.now();
  window.localStorage.setItem(
    WEBHOOK_LOG_STORAGE_KEY,
    JSON.stringify(
      statuses.map((httpStatus, i) => ({
        eventId: `evt_${i}`,
        endpointUrl: ENDPOINT,
        httpStatus,
        deliveredAt: new Date(now - (i + 1) * 60_000).toISOString(),
        requestPayload: "{}",
      }))
    )
  );
}

function renderCard() {
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages} timeZone="UTC">
      <MerchantWebhookCard />
    </NextIntlClientProvider>
  );
}

describe("MerchantWebhookCard health score (#1010)", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("shows the 7-day reliability score for the saved endpoint", async () => {
    storeConfig(true);
    storeDeliveries([504, 200, 200, 200]);
    renderCard();
    expect(await screen.findByRole("meter")).toHaveAttribute("aria-valuenow", "75");
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("hides the meter when no endpoint is active", () => {
    storeConfig(false);
    storeDeliveries([200]);
    renderCard();
    expect(screen.queryByRole("meter")).not.toBeInTheDocument();
    expect(screen.queryByText("Delivery health (last 7 days)")).not.toBeInTheDocument();
  });
});
