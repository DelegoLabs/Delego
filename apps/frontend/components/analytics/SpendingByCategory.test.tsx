"use client";

import { Suspense } from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { CurrencyProvider } from "../../hooks/useCurrency";
import { clearResource } from "../../lib/suspenseResource";
import { SpendingByCategoryCard } from "./SpendingByCategoryCard";
import { SpendingDonutChart } from "./SpendingDonutChart";
import { SpendingLegend } from "./SpendingLegend";
import { SpendingRangeSelector } from "./SpendingRangeSelector";
import {
  spendingForMode,
  type BuyerSpendingCategory,
} from "../../lib/spendingByCategory";
import type { Delegation, Order } from "@delegolabs/types";

const NOW = new Date();

function order(overrides: Partial<Order> = {}): Order {
  return {
    id: "order-x",
    delegationId: "del-1",
    status: "settled",
    totalStroops: 10_000_000n,
    lineItems: [
      { productId: "product-1", quantity: 1, unitPriceStroops: 10_000_000n },
    ],
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  } as Order;
}

function delegation(
  overrides: Partial<Delegation> & { id: string }
): Delegation {
  return {
    userId: "user-1",
    agentId: "agent-1",
    status: "active",
    policy: { maxPerTransaction: 0n, maxTotal: 0n, allowedMerchants: [] },
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  } as Delegation;
}

const mockGetOrders = vi.fn();
const mockGetDelegations = vi.fn();
vi.mock("../../lib/api", () => ({
  api: {
    getOrders: () => mockGetOrders(),
    getDelegations: () => mockGetDelegations(),
  },
}));

// Pass orders through untouched so the `category` field survives — the real
// adapter maps to the domain Order, which has no category field (#989).
vi.mock("@delegolabs/api-generated", () => ({
  adaptOrders: (orders: unknown[]) => orders,
}));

const CATEGORIES: BuyerSpendingCategory[] = [
  {
    category: "Hardware",
    totalSpentStroops: "30000000",
    percentageOfTotal: 75,
    autonomousSpendStroops: "20000000",
    manualSpendStroops: "10000000",
  },
  {
    category: "Services",
    totalSpentStroops: "10000000",
    percentageOfTotal: 25,
    autonomousSpendStroops: "0",
    manualSpendStroops: "10000000",
  },
];

function renderCard(
  props: Partial<Parameters<typeof SpendingByCategoryCard>[0]> = {}
) {
  return render(
    <CurrencyProvider>
      <Suspense fallback={<p>loading</p>}>
        <SpendingByCategoryCard
          range="current_month"
          onRangeChange={vi.fn()}
          {...props}
        />
      </Suspense>
    </CurrencyProvider>
  );
}

describe("SpendingByCategoryCard", () => {
  beforeEach(() => {
    clearResource();
    mockGetOrders.mockReset();
    mockGetDelegations.mockReset();
    window.localStorage.clear();
  });

  it("renders the donut, legend and range selector from loaded data", async () => {
    mockGetOrders.mockResolvedValue({
      data: [
        order({
          category: "Hardware",
          delegationId: "del-1",
          totalStroops: 30_000_000n,
        }),
        order({
          category: "Services",
          delegationId: "del-2",
          totalStroops: 10_000_000n,
        }),
      ],
      error: null,
    });
    mockGetDelegations.mockResolvedValue({
      data: [
        delegation({ id: "del-1", permissionLevel: "AUTO_APPROVE" }),
        delegation({ id: "del-2", permissionLevel: "SIGNER" }),
      ],
      error: null,
    });

    await act(async () => {
      renderCard();
    });

    await waitFor(() => {
      expect(
        screen.getByRole("region", { name: "Spending by category" })
      ).toBeInTheDocument();
    });

    expect(
      screen.getByRole("img", { name: "Spending by category" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: "Spending period" })
    ).toBeInTheDocument();
    expect(screen.getAllByText("Hardware").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Services").length).toBeGreaterThan(0);
  });

  it("re-bases the breakdown onto the selected spend mode", async () => {
    const user = userEvent.setup();
    mockGetOrders.mockResolvedValue({
      data: [
        order({
          category: "Hardware",
          delegationId: "del-1",
          totalStroops: 30_000_000n,
        }),
        order({
          category: "Services",
          delegationId: "del-2",
          totalStroops: 10_000_000n,
        }),
      ],
      error: null,
    });
    mockGetDelegations.mockResolvedValue({
      data: [
        delegation({ id: "del-1", permissionLevel: "AUTO_APPROVE" }),
        delegation({ id: "del-2", permissionLevel: "SIGNER" }),
      ],
      error: null,
    });

    await act(async () => {
      renderCard();
    });

    await waitFor(() => {
      expect(screen.getAllByText("Hardware").length).toBeGreaterThan(0);
    });

    // Hardware is 3 XLM of spend and all of it was autonomous.
    await user.click(screen.getByRole("button", { name: /Autonomous/ }));

    await waitFor(() => {
      const items = document.querySelectorAll(".spending-legend-item");
      expect(items[0]).toHaveTextContent("3.00 XLM");
      // Services was approved by hand, so it has no autonomous spend at all.
      expect(items[1]).toHaveTextContent("0.00 XLM");
    });
  });

  it("shows the empty state when there is no spend", async () => {
    mockGetOrders.mockResolvedValue({ data: [], error: null });
    mockGetDelegations.mockResolvedValue({ data: [], error: null });

    await act(async () => {
      renderCard();
    });

    await waitFor(() => {
      expect(
        screen.getByText("No spending in the selected range.")
      ).toBeInTheDocument();
    });
  });
});

describe("SpendingDonutChart", () => {
  it("shows the empty state for a zero total", () => {
    render(<SpendingDonutChart categories={[]} />);
    expect(
      screen.getByText("No spending to display for the selected range.")
    ).toBeInTheDocument();
  });

  it("renders a segment per category and a Total center label", () => {
    render(<SpendingDonutChart categories={CATEGORIES} />);
    const svg = screen.getByRole("img", { name: "Spending by category" });
    expect(svg.querySelectorAll("path")).toHaveLength(2);
    expect(screen.getByText("Total")).toBeInTheDocument();
  });

  it("shows a tooltip with stroop and USD amounts on segment hover", async () => {
    const user = userEvent.setup();
    render(<SpendingDonutChart categories={CATEGORIES} xlmUsdRate={0.5} />);

    const segment = screen
      .getByRole("img", { name: "Spending by category" })
      .querySelectorAll("path")[0];
    await user.hover(segment);

    const tooltip = screen.getByRole("tooltip");
    expect(tooltip).toHaveTextContent("Hardware");
    expect(tooltip).toHaveTextContent("3.00 XLM");
    expect(tooltip).toHaveTextContent("30,000,000 stroops");
    expect(tooltip).toHaveTextContent("$1.50");
    expect(tooltip).toHaveTextContent("75.0% of total spend");
  });
});

describe("SpendingLegend", () => {
  it("toggles the spend mode filter", async () => {
    const user = userEvent.setup();
    const onModeFilterChange = vi.fn();
    render(
      <SpendingLegend
        categories={CATEGORIES}
        modeFilter="all"
        onModeFilterChange={onModeFilterChange}
      />
    );

    await user.click(screen.getByRole("button", { name: /Autonomous/ }));
    expect(onModeFilterChange).toHaveBeenCalledWith("autonomous");
  });

  it("dims a category with no spend in the active mode", () => {
    const { container } = render(
      <SpendingLegend
        categories={spendingForMode(CATEGORIES, "autonomous")}
        modeFilter="autonomous"
        onModeFilterChange={vi.fn()}
      />
    );
    // Services has zero autonomous spend -> dimmed at 0.4 opacity.
    const items = container.querySelectorAll(".spending-legend-item");
    expect(items[1]).toHaveStyle({ opacity: "0.4" });
  });
});

describe("SpendingRangeSelector", () => {
  it("renders the three period options and reports changes", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<SpendingRangeSelector value="current_month" onChange={onChange} />);

    const select = screen.getByRole("combobox", { name: "Spending period" });
    expect(
      screen.getByRole("option", { name: "Current Month" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "Last 30 Days" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "Year-to-Date" })
    ).toBeInTheDocument();

    await user.selectOptions(select, "ytd");
    expect(onChange).toHaveBeenCalledWith("ytd");
  });
});
