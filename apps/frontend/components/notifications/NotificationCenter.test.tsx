import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import { NotificationCenter } from "./NotificationCenter";
import enMessages from "../../messages/en.json";

const mockUseNotifications = vi.fn();

vi.mock("../../hooks/useNotifications", async () => {
  const actual = await vi.importActual<
    typeof import("../../hooks/useNotifications")
  >("../../hooks/useNotifications");
  return {
    ...actual,
    useNotifications: () => mockUseNotifications(),
  };
});

function renderNotificationCenter(onClose: () => void) {
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <NotificationCenter onClose={onClose} />
    </NextIntlClientProvider>
  );
}

function baseState(overrides: Record<string, unknown> = {}) {
  const notifications = (overrides.notifications as any[]) || [];
  const unreadCount =
    overrides.unreadCount !== undefined
      ? (overrides.unreadCount as number)
      : notifications.filter((n) => !n.read).length;
  return {
    notifications,
    unreadCount,
    mutedCount: 0,
    groupingEnabled: false,
    setGroupingEnabled: vi.fn(),
    markAllAsRead: vi.fn(),
    markDelegationAsRead: vi.fn(),
    clearAll: vi.fn(),
    markAsRead: vi.fn(),
    remove: vi.fn(),
    pruneNow: vi.fn(),
    ...overrides,
  };
}

describe("NotificationCenter", () => {
  it("renders as a labelled, modal dialog", () => {
    mockUseNotifications.mockReturnValue(baseState());
    renderNotificationCenter(() => {});

    const dialog = screen.getByRole("dialog", { name: /notifications/i });
    expect(dialog).toHaveAttribute("aria-modal", "true");
  });

  it("moves initial focus into the panel", () => {
    mockUseNotifications.mockReturnValue(
      baseState({
        notifications: [
          {
            id: "1",
            type: "info",
            title: "Hello",
            createdAt: Date.now(),
            read: false,
          },
        ],
      })
    );
    renderNotificationCenter(() => {});

    expect(
      screen.getByRole("button", { name: /mark all read/i })
    ).toHaveFocus();
  });

  it("falls back to focusing the panel container when empty (all action buttons disabled)", () => {
    mockUseNotifications.mockReturnValue(baseState());
    renderNotificationCenter(() => {});

    expect(
      screen.getByRole("dialog", { name: /notifications/i })
    ).toHaveFocus();
  });

  it("traps Tab focus within the panel", async () => {
    const user = userEvent.setup();
    mockUseNotifications.mockReturnValue(
      baseState({
        notifications: [
          {
            id: "1",
            type: "info",
            title: "Hello",
            createdAt: Date.now(),
            read: false,
          },
        ],
      })
    );
    renderNotificationCenter(() => {});

    const markAllRead = screen.getByRole("button", { name: /mark all read/i });
    expect(markAllRead).toHaveFocus();

    await user.tab({ shift: true });
    const focusables = document.querySelectorAll<HTMLElement>(
      "button:not([disabled]), a[href]"
    );
    expect(focusables[focusables.length - 1]).toHaveFocus();
  });

  it("restores focus to the previously focused element on unmount", () => {
    mockUseNotifications.mockReturnValue(baseState());

    const trigger = document.createElement("button");
    document.body.appendChild(trigger);
    trigger.focus();

    const { unmount } = renderNotificationCenter(() => {});
    expect(
      screen.getByRole("dialog", { name: /notifications/i })
    ).toHaveFocus();

    unmount();
    expect(trigger).toHaveFocus();
    trigger.remove();
  });
});
