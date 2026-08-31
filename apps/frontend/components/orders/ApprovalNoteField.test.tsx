import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ApprovalNoteField, APPROVAL_NOTE_MAX_LENGTH } from "./ApprovalNoteField";

describe("ApprovalNoteField", () => {
  it("shows the full remaining count for an empty note", () => {
    render(<ApprovalNoteField id="note-1" value="" onChange={vi.fn()} />);
    expect(
      screen.getByText(`${APPROVAL_NOTE_MAX_LENGTH} characters remaining`)
    ).toBeInTheDocument();
  });

  it("decrements the counter as the note grows", () => {
    render(<ApprovalNoteField id="note-1" value="hello" onChange={vi.fn()} />);
    expect(screen.getByText("275 characters remaining")).toBeInTheDocument();
  });

  it("flags the counter as over-limit past the max length", () => {
    render(
      <ApprovalNoteField id="note-1" value={"a".repeat(281)} onChange={vi.fn()} />
    );
    const counter = screen.getByText("-1 characters remaining");
    expect(counter.className).toContain("approval-note-counter-over");
  });

  it("calls onChange with each keystroke's resulting value", async () => {
    // The field is controlled by its parent; without re-rendering with the
    // updated `value` between keystrokes, each keystroke reports its own
    // single-character delta rather than an accumulated string.
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<ApprovalNoteField id="note-1" value="" onChange={onChange} />);
    await user.type(screen.getByLabelText("Note (optional)"), "hi");
    expect(onChange).toHaveBeenNthCalledWith(1, "h");
    expect(onChange).toHaveBeenNthCalledWith(2, "i");
  });

  it("calls onCancel on Escape", async () => {
    const onCancel = vi.fn();
    const user = userEvent.setup();
    render(
      <ApprovalNoteField id="note-1" value="" onChange={vi.fn()} onCancel={onCancel} />
    );
    screen.getByLabelText("Note (optional)").focus();
    await user.keyboard("{Escape}");
    expect(onCancel).toHaveBeenCalled();
  });
});
