import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { AgentFab } from "./AgentFab";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) =>
    ({
      "roster.fabAria": "Open agent roster",
      "roster.fabTooltip": "Open assistant",
    })[key] ?? key,
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/store" }));
vi.mock("../chat/CopilotBubbleProvider", () => ({
  useCopilotBubble: () => ({
    prompt: null,
    openPrompt: vi.fn(),
    dismissPrompt: vi.fn(),
  }),
}));

function revealFab() {
  act(() => {
    Object.defineProperty(window, "scrollY", { value: 200, configurable: true });
    window.dispatchEvent(new Event("scroll"));
  });
}

describe("AgentFab shortcut tooltip", () => {
  afterEach(() => {
    Object.defineProperty(window, "scrollY", { value: 0, configurable: true });
    vi.restoreAllMocks();
  });

  it("links an accessible tooltip with the ⌘J / Ctrl+J hint", () => {
    vi.spyOn(window.navigator, "platform", "get").mockReturnValue("Win32");
    render(<AgentFab />);
    const fab = screen.getByTestId("agent-fab");
    const tooltip = screen.getByRole("tooltip", { hidden: true });

    expect(fab).toHaveAttribute("aria-describedby", tooltip.id);
    expect(fab).toHaveAttribute("aria-keyshortcuts", "Meta+J Control+J");
    expect(fab).toHaveAccessibleDescription("Open assistant Ctrl+J");
    expect(tooltip.querySelector("kbd")).toHaveTextContent("Ctrl+J");
  });

  it("opens on focus/hover and closes on blur, mouse leave and Escape", () => {
    render(<AgentFab />);
    revealFab();
    const fab = screen.getByTestId("agent-fab");
    const tooltip = screen.getByTestId("agent-fab-tooltip");

    expect(tooltip).toHaveAttribute("data-open", "false");
    fireEvent.focus(fab);
    expect(tooltip).toHaveAttribute("data-open", "true");
    fireEvent.keyDown(fab, { key: "Escape" });
    expect(tooltip).toHaveAttribute("data-open", "false");
    fireEvent.mouseEnter(fab);
    expect(tooltip).toHaveAttribute("data-open", "true");
    fireEvent.mouseLeave(fab);
    expect(tooltip).toHaveAttribute("data-open", "false");
  });
});
