import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { Approval } from "@delego/types";
import { ApprovalsList } from "./ApprovalsList";

function makeApprovals(count: number): Approval[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `approval-${i}`,
    title: `Approval ${i}`,
    description: null,
    amountStroops: null,
    requestedBy: "agent-1",
    status: "pending",
    createdAt: new Date(),
    updatedAt: new Date(),
  }));
}

describe("ApprovalsList — 1000-row fixture", () => {
  it("only mounts a virtualized window of rows, not all 1000", () => {
    render(<ApprovalsList approvals={makeApprovals(1000)} />);
    const rows = screen.getAllByRole("row");
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThan(100);
  });

  it("selection survives a row unmounting and remounting during scroll", () => {
    render(<ApprovalsList approvals={makeApprovals(1000)} />);

    const firstCheckbox = screen.getByLabelText("Select Approval 0") as HTMLInputElement;
    fireEvent.click(firstCheckbox);
    expect(firstCheckbox.checked).toBe(true);

    const container = screen.getByTestId("approvals-scroll-container");
    fireEvent.scroll(container, { target: { scrollTop: 20000 } });
    expect(screen.queryByLabelText("Select Approval 0")).not.toBeInTheDocument();

    fireEvent.scroll(container, { target: { scrollTop: 0 } });
    const remounted = screen.getByLabelText("Select Approval 0") as HTMLInputElement;
    expect(remounted.checked).toBe(true);
  });

  it("selecting rows across a scroll accumulates rather than resetting", () => {
    render(<ApprovalsList approvals={makeApprovals(1000)} />);
    const container = screen.getByTestId("approvals-scroll-container");

    fireEvent.click(screen.getByLabelText("Select Approval 0"));

    fireEvent.scroll(container, { target: { scrollTop: 22400 } }); // 400 * ROW_HEIGHT
    fireEvent.click(screen.getByLabelText("Select Approval 400"));

    fireEvent.scroll(container, { target: { scrollTop: 0 } });
    expect((screen.getByLabelText("Select Approval 0") as HTMLInputElement).checked).toBe(true);

    fireEvent.scroll(container, { target: { scrollTop: 22400 } });
    expect((screen.getByLabelText("Select Approval 400") as HTMLInputElement).checked).toBe(true);
  });

  it("j/k hotkeys move focus across the logical list, past the initially rendered window", () => {
    render(<ApprovalsList approvals={makeApprovals(1000)} />);

    for (let i = 0; i < 100; i++) {
      fireEvent.keyDown(window, { key: "j" });
    }

    // jsdom's Element.scrollTo() (used internally by virtualizer.scrollToIndex) doesn't reliably
    // update scrollTop or dispatch a 'scroll' event the way a real browser does. Fire the scroll
    // event with the offset scrollToIndex(100) targets, mirroring what a real browser would do
    // once the imperative scrollToIndex call takes effect.
    const container = screen.getByTestId("approvals-scroll-container");
    fireEvent.scroll(container, { target: { scrollTop: 100 * 56 } });

    const row100 = screen.getByText("Approval 100").closest('[role="row"]');
    expect(row100).toHaveAttribute("data-focused", "true");
  });

  it("the select-all bar is a sibling of the scroll region, not a virtual row — scrolling never removes it", () => {
    render(<ApprovalsList approvals={makeApprovals(1000)} />);
    const container = screen.getByTestId("approvals-scroll-container");
    fireEvent.scroll(container, { target: { scrollTop: 20000 } });
    expect(screen.getByLabelText("Select all approvals")).toBeInTheDocument();
  });

  it("select-all selects every logical row, not just the currently mounted ones", () => {
    render(<ApprovalsList approvals={makeApprovals(1000)} />);
    fireEvent.click(screen.getByLabelText("Select all approvals"));

    const container = screen.getByTestId("approvals-scroll-container");
    fireEvent.scroll(container, { target: { scrollTop: 22400 } }); // 400 * ROW_HEIGHT
    expect((screen.getByLabelText("Select Approval 400") as HTMLInputElement).checked).toBe(true);
  });
});
