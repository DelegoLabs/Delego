import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  locale: { value: "fr-FR" },
  lastUpdated: { value: null as Date | null },
}));

vi.mock("next-intl", () => ({
  useLocale: () => mocks.locale.value,
}));

vi.mock("../../hooks/useOrders", () => ({
  useOrders: () => ({
    orders: [],
    loading: false,
    error: null,
    lastUpdated: mocks.lastUpdated.value,
    refresh: vi.fn(),
  }),
}));

import TrackingPage from "./page";

describe("TrackingPage", () => {
  beforeEach(() => {
    mocks.locale.value = "fr-FR";
    mocks.lastUpdated.value = null;
  });

  it("formats the last-updated time using the active locale", () => {
    const lastUpdated = new Date("2026-01-01T14:05:09.000Z");
    const formatTime = vi
      .spyOn(lastUpdated, "toLocaleTimeString")
      .mockReturnValue("localized time");
    mocks.lastUpdated.value = lastUpdated;

    render(<TrackingPage />);

    expect(screen.getByText("Live · updated localized time")).toBeInTheDocument();
    expect(formatTime).toHaveBeenCalledWith("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  });
});
