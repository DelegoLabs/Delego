import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { IdleSessionModal } from "./IdleSessionModal";

describe("IdleSessionModal", () => {
  it("renders nothing when closed", () => {
    const { container } = render(
      <IdleSessionModal open={false} secondsLeft={30} onStay={vi.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the countdown and calls onStay from the confirm button", () => {
    const onStay = vi.fn();
    render(<IdleSessionModal open secondsLeft={12} onStay={onStay} />);
    expect(screen.getByText(/12 seconds/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /still here/i }));
    expect(onStay).toHaveBeenCalledTimes(1);
  });

  it("pluralizes the final second", () => {
    render(<IdleSessionModal open secondsLeft={1} onStay={vi.fn()} />);
    expect(screen.getByText(/\b1 second\b/)).toBeInTheDocument();
  });

  it("is an alertdialog and treats Esc as confirmation", () => {
    const onStay = vi.fn();
    render(<IdleSessionModal open secondsLeft={5} onStay={onStay} />);
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onStay).toHaveBeenCalledTimes(1);
  });
});
