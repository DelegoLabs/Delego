import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AgentMemoryTable } from "./AgentMemoryTable";
import type { AgentMemoryItem } from "../../lib/agentMemory";

const memories: AgentMemoryItem[] = [
  {
    id: "1",
    category: "personal",
    key: "Shoe size",
    value: "EU 42",
    confidence: 0.9,
    updatedAt: "2026-09-01T00:00:00Z",
  },
  {
    id: "2",
    category: "preference",
    key: "Brand",
    value: "Patagonia",
    confidence: 0.6,
    updatedAt: "2026-09-02T00:00:00Z",
  },
];

describe("AgentMemoryTable", () => {
  it("renders rows with category badges and filters by search", () => {
    render(<AgentMemoryTable memories={memories} onDelete={vi.fn()} />);
    const table = screen.getByRole("table");
    expect(within(table).getByText("Personal")).toBeInTheDocument();
    expect(within(table).getByText("Preference")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Search memories"), {
      target: { value: "patag" },
    });
    expect(screen.queryByText("Shoe size")).not.toBeInTheDocument();
    expect(screen.getByText("Brand")).toBeInTheDocument();
  });

  it("removes a row optimistically before onDelete resolves", () => {
    const onDelete = vi.fn(() => new Promise<void>(() => {}));
    render(<AgentMemoryTable memories={memories} onDelete={onDelete} />);

    fireEvent.click(
      screen.getByRole("button", { name: "Delete memory Shoe size" })
    );
    expect(onDelete).toHaveBeenCalledWith("1");
    expect(screen.queryByText("Shoe size")).not.toBeInTheDocument();
  });

  it("restores the row and shows an error when onDelete rejects", async () => {
    const onDelete = vi.fn(() => Promise.reject(new Error("nope")));
    render(<AgentMemoryTable memories={memories} onDelete={onDelete} />);

    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Delete memory Shoe size" })
      );
    });
    expect(screen.getByText("Shoe size")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(/restored/);
  });

  it("confirms before clearing all memories", async () => {
    const onDelete = vi.fn(() => Promise.resolve());
    render(<AgentMemoryTable memories={memories} onDelete={onDelete} />);

    fireEvent.click(screen.getByRole("button", { name: "Clear All Memories" }));
    const dialog = screen.getByRole("alertdialog");
    expect(onDelete).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(onDelete).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Clear All Memories" }));
    await act(async () => {
      fireEvent.click(
        within(screen.getByRole("alertdialog")).getByRole("button", {
          name: "Clear all",
        })
      );
    });
    expect(onDelete).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByText(/hasn't memorized anything/)).toBeInTheDocument();
  });

  it("filters memories with category filter chips", () => {
    render(<AgentMemoryTable memories={memories} onDelete={vi.fn()} />);

    const group = screen.getByRole("group", { name: "Filter by category" });
    const allChip = within(group).getByRole("button", { name: "All" });
    const personalChip = within(group).getByRole("button", {
      name: "Personal",
    });
    const preferenceChip = within(group).getByRole("button", {
      name: "Preference",
    });

    expect(allChip).toHaveAttribute("aria-pressed", "true");
    expect(personalChip).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(personalChip);
    expect(personalChip).toHaveAttribute("aria-pressed", "true");
    expect(allChip).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("Shoe size")).toBeInTheDocument();
    expect(screen.queryByText("Brand")).not.toBeInTheDocument();

    fireEvent.click(preferenceChip);
    expect(preferenceChip).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByText("Shoe size")).not.toBeInTheDocument();
    expect(screen.getByText("Brand")).toBeInTheDocument();

    fireEvent.click(allChip);
    expect(screen.getByText("Shoe size")).toBeInTheDocument();
    expect(screen.getByText("Brand")).toBeInTheDocument();
  });

  it("edits and saves a memory value inline with accessible labels", async () => {
    const onUpdate = vi.fn(() => Promise.resolve());
    render(
      <AgentMemoryTable
        memories={memories}
        onDelete={vi.fn()}
        onUpdate={onUpdate}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit memory Brand" }));
    const input = screen.getByLabelText("Edit value for Brand");
    expect(input).toHaveValue("Patagonia");

    fireEvent.change(input, { target: { value: "Arc'teryx" } });
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Save memory Brand" })
      );
    });

    expect(onUpdate).toHaveBeenCalledWith("2", "Arc'teryx");
    expect(screen.getByText("Arc'teryx")).toBeInTheDocument();
    expect(screen.queryByLabelText("Edit value for Brand")).not.toBeInTheDocument();
  });

  it("cancels inline editing without calling onUpdate", () => {
    const onUpdate = vi.fn(() => Promise.resolve());
    render(
      <AgentMemoryTable
        memories={memories}
        onDelete={vi.fn()}
        onUpdate={onUpdate}
      />
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Edit memory Shoe size" })
    );
    const input = screen.getByLabelText("Edit value for Shoe size");
    fireEvent.change(input, { target: { value: "EU 43" } });
    fireEvent.click(
      screen.getByRole("button", { name: "Cancel editing Shoe size" })
    );

    expect(onUpdate).not.toHaveBeenCalled();
    expect(screen.getByText("EU 42")).toBeInTheDocument();
    expect(screen.queryByText("EU 43")).not.toBeInTheDocument();
  });

  it("reverts the value and shows an error when onUpdate rejects", async () => {
    const onUpdate = vi.fn(() => Promise.reject(new Error("failed")));
    render(
      <AgentMemoryTable
        memories={memories}
        onDelete={vi.fn()}
        onUpdate={onUpdate}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit memory Brand" }));
    fireEvent.change(screen.getByLabelText("Edit value for Brand"), {
      target: { value: "Columbia" },
    });
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Save memory Brand" })
      );
    });

    expect(screen.getByText("Patagonia")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(/reverted/);
  });
});
