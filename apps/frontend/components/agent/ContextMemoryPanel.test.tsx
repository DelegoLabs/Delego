import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ContextMemoryPanel } from "./ContextMemoryPanel";
import { EMPTY_CONTEXT, type AgentConversationContext } from "../../lib/agentConversationContext";

function makeContext(
  overrides: Partial<AgentConversationContext> = {}
): AgentConversationContext {
  return { ...EMPTY_CONTEXT, ...overrides };
}

function renderPanel(
  props: Partial<React.ComponentProps<typeof ContextMemoryPanel>> = {}
) {
  const onClose = vi.fn();
  const onReset = vi.fn();
  render(
    <ContextMemoryPanel
      isOpen
      onClose={onClose}
      context={makeContext()}
      onReset={onReset}
      {...props}
    />
  );
  return { onClose, onReset };
}

// ── Visibility ────────────────────────────────────────────────────────────────

describe("ContextMemoryPanel — visibility", () => {
  it("renders nothing when closed", () => {
    render(
      <ContextMemoryPanel
        isOpen={false}
        onClose={vi.fn()}
        context={makeContext()}
        onReset={vi.fn()}
      />
    );
    expect(screen.queryByTestId("context-memory-panel")).not.toBeInTheDocument();
  });

  it("renders a modal dialog when open", () => {
    renderPanel();
    expect(
      screen.getByRole("dialog", { name: "Context / Memory" })
    ).toHaveAttribute("aria-modal", "true");
    expect(screen.getByTestId("context-memory-panel")).toBeInTheDocument();
  });

  it("closes when the close button is clicked", async () => {
    const user = userEvent.setup();
    const { onClose } = renderPanel();
    await user.click(screen.getByTestId("context-panel-close"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes when the backdrop is clicked", async () => {
    const user = userEvent.setup();
    const { onClose } = renderPanel();
    await user.click(screen.getByTestId("context-panel-overlay"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does NOT close when the panel itself is clicked", async () => {
    const user = userEvent.setup();
    const { onClose } = renderPanel();
    await user.click(screen.getByTestId("context-memory-panel"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes on Escape key", async () => {
    const user = userEvent.setup();
    const { onClose } = renderPanel();
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

// ── Empty state ───────────────────────────────────────────────────────────────

describe("ContextMemoryPanel — empty state", () => {
  it("shows the empty state when no active filters are set", () => {
    renderPanel({ context: makeContext() });
    expect(screen.getByTestId("context-empty-state")).toBeInTheDocument();
  });

  it("Reset Memory button is disabled when no filters are active", () => {
    renderPanel({ context: makeContext() });
    expect(screen.getByTestId("context-reset-button")).toBeDisabled();
  });
});

// ── Context chips ─────────────────────────────────────────────────────────────

describe("ContextMemoryPanel — context chips", () => {
  it("renders a budget chip when activeBudgetStroops is set", () => {
    renderPanel({
      context: makeContext({ activeBudgetStroops: "500000000" }),
    });
    const chips = screen.getAllByTestId("context-chip");
    const budgetChip = chips.find((c) => c.dataset.chipKey === "budget");
    expect(budgetChip).toBeInTheDocument();
    expect(budgetChip).toHaveTextContent("50 USDC");
  });

  it("renders a category chip when targetCategory is set", () => {
    renderPanel({ context: makeContext({ targetCategory: "laptop" }) });
    const chips = screen.getAllByTestId("context-chip");
    const catChip = chips.find((c) => c.dataset.chipKey === "category");
    expect(catChip).toBeInTheDocument();
    expect(catChip).toHaveTextContent("laptop");
  });

  it("renders excluded merchant chips", () => {
    renderPanel({
      context: makeContext({ excludedMerchants: ["Acme", "ShopX"] }),
    });
    const chips = screen.getAllByTestId("context-chip");
    const excluded = chips.filter((c) =>
      c.dataset.chipKey?.startsWith("excluded-")
    );
    expect(excluded).toHaveLength(2);
    const values = excluded.map((c) => c.textContent ?? "");
    expect(values.some((v) => v.includes("Acme"))).toBe(true);
    expect(values.some((v) => v.includes("ShopX"))).toBe(true);
  });

  it("renders a condition chip for 'new' condition", () => {
    renderPanel({
      context: makeContext({ preferredCondition: "new" }),
    });
    const chips = screen.getAllByTestId("context-chip");
    const condChip = chips.find((c) => c.dataset.chipKey === "condition");
    expect(condChip).toBeInTheDocument();
    expect(condChip).toHaveTextContent("New only");
  });

  it("does NOT render a condition chip for the 'any' default", () => {
    renderPanel({ context: makeContext({ preferredCondition: "any" }) });
    // Only show chips when meaningful
    const chips = screen.queryAllByTestId("context-chip");
    const condChip = chips.find((c) => c.dataset.chipKey === "condition");
    expect(condChip).toBeUndefined();
  });
});

// ── Session info ──────────────────────────────────────────────────────────────

describe("ContextMemoryPanel — session info", () => {
  it("displays the turns count", () => {
    renderPanel({ context: makeContext({ turnsCount: 4 }) });
    expect(screen.getByTestId("context-turns-count")).toHaveTextContent("4");
  });
});

// ── Reset ─────────────────────────────────────────────────────────────────────

describe("ContextMemoryPanel — reset", () => {
  it("calls onReset when Reset Memory is clicked", async () => {
    const user = userEvent.setup();
    const { onReset } = renderPanel({
      context: makeContext({ targetCategory: "laptop" }),
    });
    await user.click(screen.getByTestId("context-reset-button"));
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it("shows a reset confirmation notice when wasRecentlyReset is true", () => {
    renderPanel({
      context: makeContext(),
      wasRecentlyReset: true,
    });
    expect(screen.getByTestId("context-reset-notice")).toBeInTheDocument();
    expect(screen.getByTestId("context-reset-notice")).toHaveTextContent(
      /Memory cleared/i
    );
  });

  it("does NOT show the notice when wasRecentlyReset is false", () => {
    renderPanel({ wasRecentlyReset: false });
    expect(
      screen.queryByTestId("context-reset-notice")
    ).not.toBeInTheDocument();
  });
});
