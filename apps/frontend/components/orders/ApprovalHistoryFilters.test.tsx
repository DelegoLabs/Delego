import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  ApprovalHistoryFilters,
  EMPTY_HISTORY_FILTERS,
  hasAnyHistoryFilter,
} from "./ApprovalHistoryFilters";

function renderFilters(
  overrides: Partial<React.ComponentProps<typeof ApprovalHistoryFilters>> = {}
) {
  const onChange = vi.fn();
  const onReset = vi.fn();
  render(
    <ApprovalHistoryFilters
      values={EMPTY_HISTORY_FILTERS}
      agentOptions={["agent-1", "agent-2"]}
      delegationOptions={["del-1"]}
      onChange={onChange}
      onReset={onReset}
      {...overrides}
    />
  );
  return { onChange, onReset };
}

describe("ApprovalHistoryFilters", () => {
  it("emits a patch for each control", () => {
    const { onChange } = renderFilters();

    fireEvent.change(screen.getByLabelText("Decided on or after"), {
      target: { value: "2026-02-01" },
    });
    expect(onChange).toHaveBeenCalledWith({ from: "2026-02-01" });

    fireEvent.change(screen.getByLabelText("Filter by decision"), {
      target: { value: "rejected" },
    });
    expect(onChange).toHaveBeenCalledWith({ decision: "rejected" });

    fireEvent.change(screen.getByLabelText("Filter by agent"), {
      target: { value: "agent-2" },
    });
    expect(onChange).toHaveBeenCalledWith({ agentId: "agent-2" });
  });

  it("hides the clear button until a filter is active", () => {
    const { rerender } = render(
      <ApprovalHistoryFilters
        values={EMPTY_HISTORY_FILTERS}
        agentOptions={[]}
        delegationOptions={[]}
        onChange={vi.fn()}
        onReset={vi.fn()}
      />
    );
    expect(
      screen.queryByRole("button", { name: /clear filters/i })
    ).not.toBeInTheDocument();

    rerender(
      <ApprovalHistoryFilters
        values={{ ...EMPTY_HISTORY_FILTERS, decision: "approved" }}
        agentOptions={[]}
        delegationOptions={[]}
        onChange={vi.fn()}
        onReset={vi.fn()}
      />
    );
    expect(
      screen.getByRole("button", { name: /clear filters/i })
    ).toBeInTheDocument();
  });

  it("hasAnyHistoryFilter reflects whether any field is set", () => {
    expect(hasAnyHistoryFilter(EMPTY_HISTORY_FILTERS)).toBe(false);
    expect(
      hasAnyHistoryFilter({ ...EMPTY_HISTORY_FILTERS, agentId: "agent-1" })
    ).toBe(true);
  });
});
