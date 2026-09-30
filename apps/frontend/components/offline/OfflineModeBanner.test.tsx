// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

/**
 * The banner is a thin presentational shell over `useOnlineStatus` and
 * `next-intl`, so both are mocked to drive the exact offline/online states and
 * assert the exact copy without a provider tree (#773).
 */
const connection = { isOffline: false };

vi.mock("../../hooks/useOnlineStatus", () => ({
  useOnlineStatus: () => ({
    isOffline: connection.isOffline,
    cachedOrdersCount: 0,
    lastSyncedAt: null,
    disabledProps: {},
  }),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) =>
    key === "banner" ? "Offline Mode — Browse Only" : key,
}));

import { OfflineModeBanner } from "./OfflineModeBanner";

describe("OfflineModeBanner (#773)", () => {
  beforeEach(() => {
    connection.isOffline = false;
  });

  it("renders nothing while online", () => {
    const { container } = render(<OfflineModeBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the amber browse-only notice with the exact copy while offline", () => {
    connection.isOffline = true;
    render(<OfflineModeBanner />);

    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Offline Mode — Browse Only");
    expect(status).toHaveAttribute("aria-live", "polite");
  });
});
