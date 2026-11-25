import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

let resolveSearchParams: () => void = () => {};
let ready = false;

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => "/analytics",
  // Mimics how useSearchParams() suspends during prerender: it throws a
  // pending promise until the params are available.
  useSearchParams: () => {
    if (!ready) {
      throw new Promise<void>((resolve) => {
        resolveSearchParams = () => {
          ready = true;
          resolve();
        };
      });
    }
    return new URLSearchParams("range=30d");
  },
}));

vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: () => (key: string) => key,
}));

vi.mock("../../components/analytics/AnalyticsDashboard", () => ({
  AnalyticsDashboard: ({ range }: { range: string }) => (
    <div data-testid="dashboard">range:{range}</div>
  ),
}));

import AnalyticsPage from "./page";

describe("AnalyticsPage", () => {
  beforeEach(() => {
    ready = false;
  });

  it("shows the loading fallback while search params are suspended, then the dashboard", async () => {
    render(<AnalyticsPage />);

    expect(screen.getByText("Loading analytics...")).toBeTruthy();
    expect(screen.queryByTestId("dashboard")).toBeNull();

    resolveSearchParams();

    expect(await screen.findByTestId("dashboard")).toBeTruthy();
    expect(screen.queryByText("Loading analytics...")).toBeNull();
  });
});
