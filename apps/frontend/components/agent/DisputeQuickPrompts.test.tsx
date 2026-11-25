import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DisputeQuickPrompts, DISPUTE_QUICK_PROMPTS } from "./DisputeQuickPrompts";

describe("DisputeQuickPrompts", () => {
  it("renders all default prompt chips", () => {
    const onSelect = vi.fn();
    render(<DisputeQuickPrompts onSelect={onSelect} />);

    expect(screen.getByRole("list", { name: "Dispute quick prompts" })).toBeInTheDocument();
    for (const prompt of DISPUTE_QUICK_PROMPTS) {
      expect(screen.getByRole("button", { name: prompt.label })).toBeInTheDocument();
    }
  });

  it("calls onSelect with the clicked prompt data", () => {
    const onSelect = vi.fn();
    render(<DisputeQuickPrompts onSelect={onSelect} />);

    const button = screen.getByRole("button", { name: "Open a dispute" });
    fireEvent.click(button);

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "open-dispute",
        label: "Open a dispute",
        category: "dispute",
      })
    );
  });

  it("respects hidden prop", () => {
    render(<DisputeQuickPrompts onSelect={vi.fn()} hidden />);

    const list = screen.getByRole("list", { hidden: true });
    expect(list).toHaveAttribute("aria-hidden", "true");
    expect(list).toHaveClass("dispute-quick-prompts--hidden");
  });
});
