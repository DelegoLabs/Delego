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
});
