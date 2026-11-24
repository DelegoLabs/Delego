import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  StorefrontAnnouncementBar,
  announcementFingerprint,
} from "./StorefrontAnnouncementBar";
import type { StoreAnnouncement } from "../../lib/storefront";

const announcement: StoreAnnouncement = {
  text: "Holiday Shipping Delays: Orders ship in 48 hours",
  linkUrl: "/shipping",
  bannerType: "warning",
  updatedAt: "2026-10-20T08:00:00.000Z",
};

describe("StorefrontAnnouncementBar", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders the message, link, and an accessible dismiss button", () => {
    render(
      <StorefrontAnnouncementBar
        merchantId="merchant-1"
        announcement={announcement}
      />
    );

    expect(
      screen.getByText("Holiday Shipping Delays: Orders ship in 48 hours")
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Learn more" })).toHaveAttribute(
      "href",
      "/shipping"
    );
    expect(
      screen.getByRole("button", { name: "Dismiss announcement" })
    ).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveAccessibleName(
      "Store announcement"
    );
  });

  it("hides after dismissal and stays hidden after remount", async () => {
    const user = userEvent.setup();
    const { unmount } = render(
      <StorefrontAnnouncementBar
        merchantId="merchant-1"
        announcement={announcement}
      />
    );

    await user.click(
      screen.getByRole("button", { name: "Dismiss announcement" })
    );

    await waitFor(() =>
      expect(
        screen.queryByText("Holiday Shipping Delays: Orders ship in 48 hours")
      ).not.toBeInTheDocument()
    );

    unmount();
    render(
      <StorefrontAnnouncementBar
        merchantId="merchant-1"
        announcement={announcement}
      />
    );

    await waitFor(() =>
      expect(
        screen.queryByText("Holiday Shipping Delays: Orders ship in 48 hours")
      ).not.toBeInTheDocument()
    );
  });

  it("shows again when the merchant changes the text or timestamp", async () => {
    const user = userEvent.setup();
    const { unmount } = render(
      <StorefrontAnnouncementBar
        merchantId="merchant-1"
        announcement={announcement}
      />
    );

    await user.click(
      screen.getByRole("button", { name: "Dismiss announcement" })
    );
    await waitFor(() =>
      expect(screen.queryByRole("status")).not.toBeInTheDocument()
    );

    unmount();
    render(
      <StorefrontAnnouncementBar
        merchantId="merchant-1"
        announcement={{
          ...announcement,
          text: "New: free shipping over 100 USDC",
          updatedAt: "2026-10-21T08:00:00.000Z",
        }}
      />
    );

    expect(
      screen.getByText("New: free shipping over 100 USDC")
    ).toBeInTheDocument();
  });

  it("clears the pending dismissal timer on unmount", () => {
    vi.useFakeTimers();
    const { unmount } = render(
      <StorefrontAnnouncementBar
        merchantId="merchant-1"
        announcement={announcement}
      />
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Dismiss announcement" })
    );
    expect(vi.getTimerCount()).toBe(1);

    unmount();
    expect(vi.getTimerCount()).toBe(0);
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("does not render a CTA when the announcement has no link", () => {
    render(
      <StorefrontAnnouncementBar
        merchantId="merchant-1"
        announcement={{ ...announcement, linkUrl: undefined }}
      />
    );

    expect(
      screen.queryByRole("link", { name: "Learn more" })
    ).not.toBeInTheDocument();
  });

  it("changes the fingerprint when the announcement changes", () => {
    expect(announcementFingerprint(announcement)).not.toBe(
      announcementFingerprint({ ...announcement, text: "Something else" })
    );
  });
});
