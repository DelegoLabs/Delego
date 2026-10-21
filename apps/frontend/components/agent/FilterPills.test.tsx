import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AgentChatDrawer } from "./AgentChatDrawer";

describe("AgentChatDrawer with filter pills (#978)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("renders closed by default", () => {
    const onSubmit = vi.fn();
    render(
      <AgentChatDrawer open={false} onClose={vi.fn()} onSubmit={onSubmit} />
    );
    expect(onSubmit).not.toHaveBeenCalled();
    const drawer = screen.queryByTestId("agent-chat-drawer");
    expect(drawer).not.toBeInTheDocument();
  });

  it("renders filter pills bar when open", () => {
    const onSubmit = vi.fn();
    render(
      <AgentChatDrawer
        open={true}
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />
    );
    const pillsBar = screen.getByRole("region", { name: "Product filters" });
    expect(pillsBar).toBeInTheDocument();
  });

  it("renders category pill text when categories are provided", () => {
    const onSubmit = vi.fn();
    render(
      <AgentChatDrawer
        open={true}
        onClose={vi.fn()}
        onSubmit={onSubmit}
        categories={["Electronics"]}
      />
    );
    const categoryElements = screen.getAllByText("Electronics");
    expect(categoryElements.length).toBeGreaterThan(0);
  });

  it("renders min price pill when minPrice is set", () => {
    const onSubmit = vi.fn();
    render(
      <AgentChatDrawer
        open={true}
        onClose={vi.fn()}
        onSubmit={onSubmit}
        filters={{ minPrice: 5000000, categories: [], minRating: undefined }}
      />
    );
    const pricePills = screen.getAllByText(/\$5\.0k/);
    expect(pricePills.length).toBeGreaterThan(0);
  });

  it("renders max price pill when maxPrice is set", () => {
    const onSubmit = vi.fn();
    render(
      <AgentChatDrawer
        open={true}
        onClose={vi.fn()}
        onSubmit={onSubmit}
        filters={{ maxPrice: 10000000, categories: [], minRating: undefined }}
      />
    );
    const pricePills = screen.getAllByText(/\$10\.0k/);
    expect(pricePills.length).toBeGreaterThan(0);
  });

  it("renders min rating pill when minRating is set", () => {
    const onSubmit = vi.fn();
    render(
      <AgentChatDrawer
        open={true}
        onClose={vi.fn()}
        onSubmit={onSubmit}
        filters={{ minPrice: undefined, maxPrice: undefined, minRating: 3, categories: [] }}
      />
    );
    const ratingPill = screen.getByText("3★ and above");
    expect(ratingPill).toBeInTheDocument();
  });

  it("clears all filters on clear filters button click", () => {
    render(
      <AgentChatDrawer
        open={true}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
        filters={{
          minPrice: 5000000,
          maxPrice: 10000000,
          minRating: 3,
          categories: ["Electronics"],
        }}
        onClearFilters={() => {}}
      />
    );
    const clearButton = screen.getByText(/^Clear filters$/);
    expect(clearButton).toBeInTheDocument();
    fireEvent.click(clearButton);
  });

it("passes filter params to onSubmit when sending message", () => {
    const onSubmit = vi.fn();
    render(
      <AgentChatDrawer
        open={true}
        onClose={vi.fn()}
        onSubmit={onSubmit}
        filters={{ minPrice: 5000000, categories: ["Electronics"], minRating: 3 }}
      />
    );
    const input = screen.getByPlaceholderText("Find me a laptop under $1,000…");
    fireEvent.change(input, { target: { value: "laptop" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSubmit).toHaveBeenCalled();
    const [prompt, orderId, filterParams] = onSubmit.mock.calls[0];
    expect(prompt).toBe("laptop");
    expect(filterParams).toHaveProperty("minPrice");
    expect(filterParams).toHaveProperty("cat");
    expect(filterParams).toHaveProperty("minRating");
  });

  it("renders multiple category pills", () => {
    const onSubmit = vi.fn();
    render(
      <AgentChatDrawer
        open={true}
        onClose={vi.fn()}
        onSubmit={onSubmit}
        categories={["Electronics", "Clothing", "Food"]}
      />
    );
    const categoryElements = screen.getAllByText(/Electronics|Clothing|Food/);
    expect(categoryElements.length).toBe(3);
  });
});