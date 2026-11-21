import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { AgentFab } from "./AgentFab";
import { mockMatchMedia } from "../../tests/fakeAudioContext";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) =>
    ({
      "roster.fabAria": "Open agent roster",
      "roster.fabTooltip": "Open assistant",
    })[key] ?? key,
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/store" }));
const copilot = vi.hoisted(() => ({
  prompt: null as null | { message: string; actionLabel: string },
}));
vi.mock("../chat/CopilotBubbleProvider", () => ({
  useCopilotBubble: () => ({
    prompt: copilot.prompt,
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

describe("AgentFab reduced motion", () => {
  let restore: () => void;
  afterEach(() => {
    restore();
    copilot.prompt = null;
  });

  it("pulses and animates when motion is allowed", () => {
    restore = mockMatchMedia(false);
    copilot.prompt = { message: "Check this", actionLabel: "Ask" };
    const { container } = render(<AgentFab />);
    expect(screen.getByTestId("agent-fab")).toHaveClass("agent-fab--pulsing");
    expect(container.firstChild).not.toHaveClass("agent-fab-shell--reduced-motion");
  });

  it("swaps the pulse for a static highlight and disables the reveal transition", () => {
    restore = mockMatchMedia(true);
    copilot.prompt = { message: "Check this", actionLabel: "Ask" };
    const { container } = render(<AgentFab />);
    const fab = screen.getByTestId("agent-fab");
    expect(fab).not.toHaveClass("agent-fab--pulsing");
    expect(fab).toHaveClass("agent-fab--attention");
    expect(container.firstChild).toHaveClass("agent-fab-shell--reduced-motion");
  });
});
