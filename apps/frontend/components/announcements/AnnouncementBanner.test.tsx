import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AnnouncementBanner } from "./AnnouncementBanner";

const feed = [
  {
    id: "a1",
    message: "New: dispute filing is now live",
    link: "/orders",
    severity: "info",
  },
];

describe("AnnouncementBanner", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => feed,
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("renders nothing before the feed loads and nothing when empty", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => [] })
    );
    const { container } = render(<AnnouncementBanner />);
    await waitFor(() => expect(container.firstChild).toBeNull());
  });

  it("renders the message, severity tone, and link", async () => {
    render(<AnnouncementBanner />);
    expect(
      await screen.findByText("New: dispute filing is now live")
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Learn more" })).toHaveAttribute(
      "href",
      "/orders"
    );
  });

  it("dismisses and does not resurface after remount", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<AnnouncementBanner />);
    await screen.findByText("New: dispute filing is now live");

    await user.click(
      screen.getByRole("button", { name: "Dismiss announcement" })
    );

    await waitFor(() =>
      expect(
        screen.queryByText("New: dispute filing is now live")
      ).not.toBeInTheDocument()
    );

    unmount();
    render(<AnnouncementBanner />);
    await waitFor(() => {
      expect(
        screen.queryByText("New: dispute filing is now live")
      ).not.toBeInTheDocument();
    });
  });

  it("clears the pending dismissal timer on unmount", async () => {
    const { unmount } = render(<AnnouncementBanner />);
    await screen.findByText("New: dispute filing is now live");
    vi.useFakeTimers();

    fireEvent.click(
      screen.getByRole("button", { name: "Dismiss announcement" })
    );
    expect(vi.getTimerCount()).toBe(1);

    unmount();
    expect(vi.getTimerCount()).toBe(0);
    expect(window.localStorage.getItem("delego_dismissed_announcements")).toBe(
      null
    );

    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(window.localStorage.getItem("delego_dismissed_announcements")).toBe(
      null
    );
  });
});
