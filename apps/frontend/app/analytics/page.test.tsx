import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import enMessages from "../../messages/en.json";
import deMessages from "../../messages/de.json";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => "/analytics",
  useSearchParams: () => new URLSearchParams(),
}));

// The dashboard fetches its own data; this test only covers the page header.
vi.mock("../../components/analytics/AnalyticsDashboard", () => ({
  AnalyticsDashboard: () => null,
}));

import AnalyticsPage from "./page";

describe("AnalyticsPage header", () => {
  it("renders the heading and subtitle from the en catalog", () => {
    render(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <AnalyticsPage />
      </NextIntlClientProvider>
    );

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: enMessages.analytics.title,
      })
    ).toBeInTheDocument();
    expect(screen.getByText(enMessages.analytics.subtitle)).toBeInTheDocument();
  });

  it("renders the translated heading and subtitle in German", () => {
    render(
      <NextIntlClientProvider locale="de" messages={deMessages}>
        <AnalyticsPage />
      </NextIntlClientProvider>
    );

    expect(
      screen.getByRole("heading", { level: 1, name: "Analysen" })
    ).toBeInTheDocument();
    expect(screen.getByText(deMessages.analytics.subtitle)).toBeInTheDocument();
  });
});
