import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PromptChipsBar, type PromptChip } from "./PromptChipsBar.js";

const chips: PromptChip[] = [
  {
    id: "reorder",
    label: "Reorder coffee",
    promptText: "Reorder my last coffee order",
    category: "reorder",
  },
  {
    id: "track",
    label: "Track my order",
    promptText: "Where is my latest order?",
    category: "query",
  },
  {
    id: "approve",
    label: "Approve pending",
    promptText: "Show me orders awaiting approval",
    category: "approval",
  },
];

describe("PromptChipsBar", () => {
  it("renders nothing when there are no chips", () => {
    const { container } = render(<PromptChipsBar chips={[]} onSelect={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders a chip per suggestion", () => {
    render(<PromptChipsBar chips={chips} onSelect={vi.fn()} />);
    expect(screen.getAllByRole("option")).toHaveLength(3);
    expect(screen.getByRole("listbox")).toBeDefined();
    expect(screen.getByRole("option", { name: "Reorder coffee" })).toBeDefined();
  });

  it("hands the chip's prompt text to onSelect when clicked", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<PromptChipsBar chips={chips} onSelect={onSelect} />);

    await user.click(screen.getByRole("option", { name: "Track my order" }));
    expect(onSelect).toHaveBeenCalledWith("Where is my latest order?");
  });

  it("moves focus with the arrow keys and wraps at both ends", async () => {
    const user = userEvent.setup();
    render(<PromptChipsBar chips={chips} onSelect={vi.fn()} />);

    const first = screen.getByRole("option", { name: "Reorder coffee" });
    first.focus();

    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("option", { name: "Track my order" })).toHaveFocus();

    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("option", { name: "Approve pending" })).toHaveFocus();

    // Wraps forward from the last chip to the first.
    await user.keyboard("{ArrowRight}");
    expect(first).toHaveFocus();

    // Wraps backward from the first chip to the last.
    await user.keyboard("{ArrowLeft}");
    expect(screen.getByRole("option", { name: "Approve pending" })).toHaveFocus();
  });

  it("ignores keys other than left/right arrow", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<PromptChipsBar chips={chips} onSelect={onSelect} />);

    screen.getByRole("option", { name: "Reorder coffee" }).focus();
    await user.keyboard("a");

    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByRole("option", { name: "Reorder coffee" })).toHaveFocus();
  });
});
