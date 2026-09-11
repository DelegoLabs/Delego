import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  CommandRegistryProvider,
  useRegisterCommands,
  type Command,
} from "../../hooks/useCommandRegistry";
import { CommandPalette } from "./CommandPalette";

const performOrders = vi.fn();
const performDelegations = vi.fn();
const performExportCsv = vi.fn();

const testCommands: Command[] = [
  {
    id: "nav:/orders",
    label: "Go to Orders",
    subtitle: "/orders",
    icon: "📦",
    keywords: ["/orders"],
    group: "navigate",
    perform: performOrders,
  },
  {
    id: "nav:/delegations",
    label: "Go to Delegations",
    subtitle: "/delegations",
    icon: "🤝",
    keywords: ["/delegations"],
    group: "navigate",
    perform: performDelegations,
  },
  {
    id: "action:export-orders-csv",
    label: "Export orders as CSV",
    subtitle: "Download the current order list",
    icon: "📤",
    keywords: ["export", "csv"],
    group: "actions",
    perform: performExportCsv,
  },
];

function Fixture({ onClose }: { onClose: () => void }) {
  useRegisterCommands(testCommands);
  return <CommandPalette onClose={onClose} />;
}

function renderPalette(onClose = vi.fn()) {
  const utils = render(
    <CommandRegistryProvider>
      <Fixture onClose={onClose} />
    </CommandRegistryProvider>
  );
  return { onClose, ...utils };
}

describe("CommandPalette", () => {
  beforeEach(() => {
    window.localStorage.clear();
    performOrders.mockClear();
    performDelegations.mockClear();
    performExportCsv.mockClear();
  });

  it("lists all registered commands grouped when the query is empty", () => {
    renderPalette();
    expect(screen.getByText("Go to Orders")).toBeInTheDocument();
    expect(screen.getByText("Go to Delegations")).toBeInTheDocument();
    expect(screen.getByText("Export orders as CSV")).toBeInTheDocument();
    expect(screen.getByText("Navigate")).toBeInTheDocument();
    expect(screen.getByText("Quick actions")).toBeInTheDocument();
  });

  it("focuses the search input on mount", () => {
    renderPalette();
    expect(screen.getByRole("combobox")).toHaveFocus();
  });

  it("fuzzy-filters commands as the user types", async () => {
    const user = userEvent.setup();
    renderPalette();

    await user.type(screen.getByRole("combobox"), "csv");

    expect(screen.getByText("Export orders as CSV")).toBeInTheDocument();
    expect(screen.queryByText("Go to Orders")).not.toBeInTheDocument();
  });

  it("shows a no-match state for an unmatched query", async () => {
    const user = userEvent.setup();
    renderPalette();

    await user.type(screen.getByRole("combobox"), "zzzzz");

    expect(screen.getByText("No matching commands")).toBeInTheDocument();
  });

  it("runs the highlighted command and closes on Enter", async () => {
    const user = userEvent.setup();
    const { onClose } = renderPalette();

    await user.type(screen.getByRole("combobox"), "csv");
    await user.keyboard("{Enter}");

    expect(performExportCsv).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("moves the highlighted item with arrow keys before running it", async () => {
    const user = userEvent.setup();
    renderPalette();
    await user.keyboard("{ArrowDown}{Enter}");

    expect(performDelegations).toHaveBeenCalledTimes(1);
  });

  it("closes on Escape without running a command", async () => {
    const user = userEvent.setup();
    const { onClose } = renderPalette();

    await user.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(performOrders).not.toHaveBeenCalled();
  });

  it("remembers the run command as Recent on the next open", async () => {
    const user = userEvent.setup();
    const { unmount } = renderPalette();

    await user.type(screen.getByRole("combobox"), "csv");
    await user.keyboard("{Enter}");
    unmount();

    renderPalette();
    expect(screen.getByText("Recent")).toBeInTheDocument();
  });
});
