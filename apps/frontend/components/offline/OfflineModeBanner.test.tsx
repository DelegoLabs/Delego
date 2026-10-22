// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

/**
 * The banner is a thin presentational shell over `useOnlineStatus` and
 * `next-intl`, so both are mocked to drive the exact offline/online states and
 * assert the exact copy without a provider tree (#773).
 */
const connection = { connectionStatus: "online" };

vi.mock("../../hooks/useOnlineStatus", () => ({
  useOnlineStatus: () => ({
    connectionStatus: connection.connectionStatus,
    cachedOrdersCount: 0,
    lastSyncedAt: null,
    disabledProps: {},
  }),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => {
    if (key === "banner") return "Offline Mode — Browse Only";
    if (key === "backOnline") return "Back Online";
    return key;
  },
}));

import { OfflineModeBanner } from "./OfflineModeBanner";

describe("OfflineModeBanner (#773)", () => {
  beforeEach(() => {
    connection.connectionStatus = "online";
  });

  it("renders nothing while online", () => {
    const { container } = render(<OfflineModeBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the amber browse-only notice with the exact copy while offline", () => {
    connection.connectionStatus = "offline";
    render(<OfflineModeBanner />);

    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Offline Mode — Browse Only");
    expect(status).toHaveAttribute("aria-live", "polite");
  });

  it("shows a green Back Online toast after an offline-to-online transition", () => {
    const { rerender } = render(<OfflineModeBanner />);

    connection.connectionStatus = "offline";
    rerender(<OfflineModeBanner />);
    expect(screen.queryByText("Back Online")).not.toBeInTheDocument();

    connection.connectionStatus = "online";
    rerender(<OfflineModeBanner />);
    expect(screen.getByRole("status"))
      .toHaveClass("back-online-toast");
    expect(screen.getByRole("status")).toHaveTextContent("Back Online");
  });
});
