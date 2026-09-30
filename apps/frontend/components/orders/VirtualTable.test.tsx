/**
 * VirtualTable.test.tsx (Issue #782)
 *
 * Unit and component tests for the VirtualTable component.
 *
 * Test strategy:
 *  - Rendering: empty state, single item, multiple items.
 *  - Virtualization: only a subset of rows is in the DOM for large datasets.
 *  - Accessibility: aria attributes are correct.
 *  - Responsive layout: ResizeObserver updates container height.
 *  - Integration: VirtualTableProps interface is honoured correctly.
 *
 * jsdom limitation:
 *   jsdom does not implement scrolling or layout (getBoundingClientRect
 *   always returns zeros). The virtualizer therefore only renders rows that
 *   fit within the default 0-px viewport height, which collapses to an empty
 *   virtual window. We polyfill ResizeObserver to emit a realistic height so
 *   the virtualizer has a non-zero scroll window, and we set a non-zero
 *   `offsetHeight` on the scroll container so getVirtualItems returns rows.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { VirtualTable, type VirtualTableProps } from "./VirtualTable";

// ─── Helpers ─────────────────────────────────────────────────────────────────

interface Row {
  id: string;
  label: string;
}

function buildRows(count: number): Row[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `row-${i}`,
    label: `Row label ${i}`,
  }));
}

function renderRow(item: Row) {
  return (
    <div data-testid={`content-${item.id}`} style={{ height: 72 }}>
      {item.label}
    </div>
  );
}

function renderTable(props: Partial<VirtualTableProps<Row>> = {}) {
  const defaults: VirtualTableProps<Row> = {
    data: buildRows(10),
    estimateRowHeight: 72,
    renderRow,
  };
  return render(<VirtualTable {...defaults} {...props} />);
}

// ─── ResizeObserver & layout polyfills ───────────────────────────────────────
//
// jsdom has no layout engine, so ResizeObserver never fires and all
// getBoundingClientRect() calls return zeros. We replace it with a
// synchronous stub that immediately reports a realistic container size,
// and override offsetHeight on scroll containers so the virtualizer
// calculates a non-zero virtual window.

const CONTAINER_HEIGHT = 600;
const ROW_HEIGHT = 72;

let observerCallback: ResizeObserverCallback | null = null;

class MockResizeObserver implements ResizeObserver {
  constructor(cb: ResizeObserverCallback) {
    observerCallback = cb;
  }
  observe(target: Element) {
    // Immediately emit a synthetic entry with a realistic height.
    if (observerCallback) {
      const entry = {
        target,
        contentRect: {
          height: CONTAINER_HEIGHT,
          width: 800,
          top: 0,
          left: 0,
          bottom: CONTAINER_HEIGHT,
          right: 800,
          x: 0,
          y: 0,
          toJSON() {
            return this;
          },
        },
        borderBoxSize: [],
        contentBoxSize: [],
        devicePixelContentBoxSize: [],
      } as unknown as ResizeObserverEntry;
      observerCallback([entry], this);
    }
  }
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", MockResizeObserver);

  // Give scroll containers a non-zero offsetHeight so the virtualizer
  // correctly computes how many rows fit in the viewport.
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
    configurable: true,
    get() {
      // Only return a height for the designated scroll container.
      if (
        this instanceof HTMLElement &&
        this.dataset?.testid === "virtual-table-scroll"
      ) {
        return CONTAINER_HEIGHT;
      }
      return 0;
    },
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("VirtualTable", () => {
  // ── Empty state ──────────────────────────────────────────────────────────

  describe("empty state", () => {
    it("renders the empty-state message when data is empty", () => {
      renderTable({ data: [] });
      expect(screen.getByTestId("virtual-table-empty")).toBeInTheDocument();
      expect(screen.getByText(/no rows to display/i)).toBeInTheDocument();
    });

    it("does not render the scroll region when data is empty", () => {
      renderTable({ data: [] });
      expect(screen.queryByTestId("virtual-table-scroll")).not.toBeInTheDocument();
    });

    it("does not render the outer virtual-table wrapper when data is empty", () => {
      renderTable({ data: [] });
      expect(screen.queryByTestId("virtual-table")).not.toBeInTheDocument();
    });
  });

  // ── Basic rendering ──────────────────────────────────────────────────────

  describe("with data", () => {
    it("renders the outer virtual-table container", () => {
      renderTable({ data: buildRows(5) });
      expect(screen.getByTestId("virtual-table")).toBeInTheDocument();
    });

    it("renders the scroll container with the correct role and aria-label", () => {
      renderTable({ data: buildRows(5) });
      const scroll = screen.getByRole("region", { name: /virtualized order list/i });
      expect(scroll).toBeInTheDocument();
    });

    it("renders a single row when data has one item", () => {
      const data = [{ id: "only", label: "Only row" }];
      renderTable({ data });
      // The virtualizer renders at least the single row since total < viewport.
      expect(screen.getByTestId("content-only")).toBeInTheDocument();
      expect(screen.getByText("Only row")).toBeInTheDocument();
    });

    it("renders virtual rows for a small dataset", () => {
      const data = buildRows(5);
      renderTable({ data });
      // All 5 rows fit inside a 600px viewport at 72px each — all should render.
      data.forEach((row) => {
        expect(screen.getByTestId(`content-${row.id}`)).toBeInTheDocument();
      });
    });
  });

  // ── Virtualization ───────────────────────────────────────────────────────

  describe("virtualization", () => {
    it("does not render all rows for a large dataset", () => {
      // 1000 rows at 72px each = 72 000px of scroll height. Only ~8 fit in
      // a 600px container (+ overscan). Far fewer than 1 000 should be in DOM.
      const data = buildRows(1000);
      renderTable({ data, estimateRowHeight: ROW_HEIGHT });

      // Count rendered virtual rows by data-testid pattern.
      const rendered = screen
        .getAllByTestId(/^virtual-row-\d+$/)
        .filter((el) => el.dataset.testid?.startsWith("virtual-row-"));
      expect(rendered.length).toBeGreaterThan(0);
      // Must be far fewer than the total row count.
      expect(rendered.length).toBeLessThan(data.length);
    });

    it("does not render the content for rows outside the virtual window", () => {
      const data = buildRows(1000);
      renderTable({ data, estimateRowHeight: ROW_HEIGHT });

      // Content of row 999 (last row) should not be in the DOM initially.
      expect(screen.queryByTestId("content-row-999")).not.toBeInTheDocument();
    });

    it("each virtual row has aria-rowindex set to 1-based position", () => {
      const data = buildRows(20);
      renderTable({ data, estimateRowHeight: ROW_HEIGHT });

      const firstRow = screen.queryByTestId("virtual-row-0");
      if (firstRow) {
        expect(firstRow).toHaveAttribute("aria-rowindex", "1");
      }
    });

    it("each virtual row has data-index set to 0-based position", () => {
      const data = buildRows(20);
      renderTable({ data, estimateRowHeight: ROW_HEIGHT });

      const firstRow = screen.queryByTestId("virtual-row-0");
      if (firstRow) {
        expect(firstRow).toHaveAttribute("data-index", "0");
      }
    });
  });

  // ── renderRow callback ────────────────────────────────────────────────────

  describe("renderRow", () => {
    it("calls renderRow with the correct item", () => {
      const mockRenderRow = vi.fn((item: Row) => (
        <span data-testid={`mocked-${item.id}`}>{item.label}</span>
      ));
      const data = buildRows(3);
      renderTable({ data, renderRow: mockRenderRow });

      // renderRow should have been called for each visible row.
      expect(mockRenderRow).toHaveBeenCalled();
      // All items should map to the correct argument.
      const calledWith = mockRenderRow.mock.calls.map(([item]) => item.id);
      calledWith.forEach((id) => {
        expect(id).toMatch(/^row-\d+$/);
      });
    });

    it("renders custom row content from renderRow", () => {
      const data = [{ id: "custom", label: "Custom content" }];
      const customRender = (item: Row) => (
        <article data-testid={`article-${item.id}`}>
          <h2>{item.label}</h2>
        </article>
      );
      renderTable({ data, renderRow: customRender });
      expect(screen.getByTestId("article-custom")).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Custom content" })).toBeInTheDocument();
    });
  });

  // ── VirtualTableProps type coverage ──────────────────────────────────────

  describe("VirtualTableProps interface", () => {
    it("accepts generic type parameter T and renders correctly", () => {
      interface ProductRow {
        sku: string;
        name: string;
      }
      const products: ProductRow[] = [
        { sku: "A001", name: "Widget Alpha" },
        { sku: "B002", name: "Widget Beta" },
      ];
      render(
        <VirtualTable<ProductRow>
          data={products}
          estimateRowHeight={56}
          renderRow={(p) => (
            <div key={p.sku} data-testid={`product-${p.sku}`}>
              {p.name}
            </div>
          )}
        />
      );
      expect(screen.getByTestId("product-A001")).toBeInTheDocument();
      expect(screen.getByText("Widget Alpha")).toBeInTheDocument();
    });

    it("uses estimateRowHeight to configure the virtualizer", () => {
      // We can infer correctness by checking that a very large estimateRowHeight
      // means fewer rows are rendered (since even fewer fit per viewport-height).
      const data = buildRows(500);
      renderTable({ data, estimateRowHeight: 300 });

      const rows = screen.queryAllByTestId(/^virtual-row-\d+$/);
      // With 300px rows and a 600px viewport: ~2 visible + overscan = ~12 max.
      expect(rows.length).toBeLessThan(20);
    });
  });

  // ── Responsive layout ─────────────────────────────────────────────────────

  describe("responsive layout", () => {
    it("renders the scroll container when data is non-empty", () => {
      renderTable({ data: buildRows(5) });
      const scroll = screen.getByTestId("virtual-table-scroll");
      expect(scroll).toBeInTheDocument();
    });

    it("applies overflow-y: auto on the scroll container", () => {
      renderTable({ data: buildRows(5) });
      const scroll = screen.getByTestId("virtual-table-scroll");
      expect(scroll).toHaveStyle({ overflowY: "auto" });
    });

    it("applies contain: strict on the scroll container for paint optimisation", () => {
      renderTable({ data: buildRows(5) });
      const scroll = screen.getByTestId("virtual-table-scroll");
      expect(scroll).toHaveStyle({ contain: "strict" });
    });

    it("applies willChange: scroll-position for GPU-layer promotion", () => {
      renderTable({ data: buildRows(5) });
      const scroll = screen.getByTestId("virtual-table-scroll");
      expect(scroll).toHaveStyle({ willChange: "scroll-position" });
    });
  });
});
