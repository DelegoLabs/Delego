import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import enMessages from "../../messages/en.json";
import deMessages from "../../messages/de.json";

const listCachedReads = vi.fn();
vi.mock("../../lib/offlineCache", () => ({
  listCachedReads: () => listCachedReads(),
}));

import OfflinePage from "./page";

function renderPage(locale: "en" | "de") {
  const messages = locale === "en" ? enMessages : deMessages;
  return render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <OfflinePage />
    </NextIntlClientProvider>
  );
}

describe("OfflinePage", () => {
  it("renders the offline copy from the en catalog", async () => {
    listCachedReads.mockResolvedValue([]);
    renderPage("en");

    expect(
      screen.getByRole("heading", { level: 1, name: "You're offline" })
    ).toBeInTheDocument();
    expect(screen.getByText("Available offline")).toBeInTheDocument();
    expect(
      await screen.findByText(enMessages.offline.page.empty)
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Try again" })
    ).toBeInTheDocument();
  });

  it("interpolates the saved time for cached reads", async () => {
    const cachedAt = new Date("2026-01-02T03:04:05Z");
    listCachedReads.mockResolvedValue([
      { url: "/orders", label: "Orders", cachedAt },
    ]);
    renderPage("en");

    expect(
      await screen.findByText(`saved ${cachedAt.toLocaleString()}`)
    ).toBeInTheDocument();
  });

  it("renders translated copy in German", async () => {
    listCachedReads.mockResolvedValue([]);
    renderPage("de");

    expect(
      screen.getByRole("heading", { level: 1, name: "Du bist offline" })
    ).toBeInTheDocument();
    expect(screen.getByText("Offline verfügbar")).toBeInTheDocument();
    expect(
      await screen.findByText(deMessages.offline.page.empty)
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Erneut versuchen" })
    ).toBeInTheDocument();
  });
});
