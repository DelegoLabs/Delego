import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CommandPaletteTrigger } from "./CommandPaletteTrigger";

const setOpen = vi.fn();
vi.mock("./CommandPaletteProvider", () => ({
  useCommandPalette: () => ({ open: false, setOpen }),
}));

function mockPlatform(platform: string) {
  vi.spyOn(window.navigator, "platform", "get").mockReturnValue(platform);
}

describe("CommandPaletteTrigger", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    setOpen.mockReset();
  });

  it("shows a Ctrl+K kbd badge on non-Apple platforms", () => {
    mockPlatform("Win32");
    render(<CommandPaletteTrigger />);
    const button = screen.getByTestId("command-palette-trigger");
    expect(button.querySelector("kbd")).toHaveTextContent("Ctrl+K");
    expect(button).toHaveAttribute("aria-keyshortcuts", "Meta+K Control+K");
    expect(button).toHaveAccessibleName("Open command palette (Ctrl+K)");
  });

  it("shows a ⌘K kbd badge on macOS", () => {
    mockPlatform("MacIntel");
    render(<CommandPaletteTrigger />);
    expect(
      screen.getByTestId("command-palette-trigger").querySelector("kbd")
    ).toHaveTextContent("⌘K");
  });

  it("opens the palette on click", async () => {
    render(<CommandPaletteTrigger />);
    await userEvent.click(screen.getByTestId("command-palette-trigger"));
    expect(setOpen).toHaveBeenCalledWith(true);
  });
});
