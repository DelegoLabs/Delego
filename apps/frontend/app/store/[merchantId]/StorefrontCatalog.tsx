"use client";

/**
 * Buyer-facing product catalog for a single merchant storefront.
 * Supports search filtering and adding products to the global cart (#917).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatAmount } from "@delegolabs/ui";
import { StockDepletionPanel } from "../../../components/storefront/StockDepletionPanel";
import {
  filterStoreProducts,
  type MerchantProduct,
} from "../../../lib/storefront";
import {
  availableToSell,
  canAddToCart,
  fetchStockDepletion,
  type StockDepletionInfo,
} from "../../../lib/stockDepletion";
import { useCart } from "../../../hooks/useCart";
import type { CartItem } from "../../../lib/cart";
import { useInfiniteScroll } from "../../../hooks/useInfiniteScroll";

const CATALOG_PAGE_SIZE = 12;

interface SavedCatalogPosition {
  displayedCount: number;
  scrollY: number;
}

function catalogScrollKey(merchantId: string): string {
  return `delego:storefront-catalog:${merchantId}`;
}

function readSavedPosition(key: string): SavedCatalogPosition | null {
  try {
    const value = window.sessionStorage.getItem(key);
    if (!value) return null;
    const parsed = JSON.parse(value) as Partial<SavedCatalogPosition>;
    return Number.isFinite(parsed.displayedCount) && Number.isFinite(parsed.scrollY)
      ? { displayedCount: Math.max(0, parsed.displayedCount!), scrollY: Math.max(0, parsed.scrollY!) }
      : null;
  } catch {
    return null;
  }
}

function formatPrice(priceStroops: string): string {
  if (!/^\d+$/.test(priceStroops)) return priceStroops;
  try {
    const formatted = formatAmount(BigInt(priceStroops));
    return `${formatted.value} ${formatted.symbol}`.trim();
  } catch {
    return priceStroops;
  }
}

interface StorefrontCatalogProps {
  products: MerchantProduct[];
  /** Passed down from StorePage so cart items know which merchant they belong to. */
  merchantId: string;
  merchantName: string;
  payoutAddress: string;
}

export function StorefrontCatalog({
  products,
  merchantId,
  merchantName,
  payoutAddress,
}: StorefrontCatalogProps) {
  const [query, setQuery] = useState("");
  const [displayedCount, setDisplayedCount] = useState(CATALOG_PAGE_SIZE);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [paginationError, setPaginationError] = useState<string | null>(null);
  const [liveStock, setLiveStock] = useState<Record<string, StockDepletionInfo>>({});
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const { addItem, openDrawer, summary } = useCart();
  const uniqueProducts = useMemo(
    () => Array.from(new Map(products.map((product) => [product.id, product])).values()),
    [products]
  );
  const productKey = uniqueProducts.map((product) => product.id).join("\n");
  const scrollKey = useMemo(() => catalogScrollKey(merchantId), [merchantId]);
  const savedPosition = useRef<SavedCatalogPosition | null>(null);
  const restoredPosition = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const ids = productKey ? productKey.split("\n") : [];
    async function tick() {
      const updates = await Promise.all(
        ids.map(async (id) => [id, await fetchStockDepletion(merchantId, id)] as const)
      );
      if (cancelled) return;
      setChecked((prev) => ({
        ...prev,
        ...Object.fromEntries(ids.map((id) => [`${merchantId}/${id}`, true])),
      }));
      setLiveStock((prev) => {
        const next = { ...prev };
        for (const [id, stock] of updates) {
          if (stock) next[id] = stock;
        }
        return next;
      });
    }
    void tick();
    const timer = window.setInterval(() => void tick(), 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [merchantId, productKey]);

  function stockFor(product: MerchantProduct): StockDepletionInfo | null {
    return liveStock[product.id] ?? product.stock ?? null;
  }

  const visible = useMemo(
    () => filterStoreProducts(uniqueProducts, query),
    [uniqueProducts, query]
  );

  const displayedProducts = visible.slice(0, displayedCount);
  const hasMore = displayedCount < visible.length;

  useEffect(() => {
    restoredPosition.current = false;
    savedPosition.current = readSavedPosition(scrollKey);
    setDisplayedCount(
      Math.max(CATALOG_PAGE_SIZE, savedPosition.current?.displayedCount ?? CATALOG_PAGE_SIZE)
    );
  }, [scrollKey]);

  useEffect(() => {
    // A changed search is a new catalog session; don't restore an old position.
    if (!query) return;
    restoredPosition.current = true;
    savedPosition.current = null;
    setDisplayedCount(CATALOG_PAGE_SIZE);
    setPaginationError(null);
    try {
      window.sessionStorage.removeItem(scrollKey);
    } catch {
      // Storage can be unavailable in privacy-restricted browsers.
    }
  }, [query, scrollKey]);

  useEffect(() => {
    const saved = savedPosition.current;
    if (!saved || restoredPosition.current || displayedProducts.length < Math.min(saved.displayedCount, visible.length)) {
      return;
    }
    const restore = () => window.scrollTo({ top: saved.scrollY, behavior: "auto" });
    const frame = window.requestAnimationFrame?.(restore) ?? window.setTimeout(restore, 0);
    restoredPosition.current = true;
    return () => {
      if (window.cancelAnimationFrame) window.cancelAnimationFrame(frame);
      else window.clearTimeout(frame);
    };
  }, [displayedProducts.length, visible.length]);

  useEffect(() => {
    return () => {
      // Save only the unfiltered catalog. A filter change intentionally starts
      // a fresh browsing session rather than restoring a stale scroll offset.
      if (query) return;
      try {
        window.sessionStorage.setItem(
          scrollKey,
          JSON.stringify({ displayedCount, scrollY: window.scrollY })
        );
      } catch {
        // Storage can be unavailable in privacy-restricted browsers.
      }
    };
  }, [displayedCount, query, scrollKey]);

  const loadMore = useCallback(async () => {
    if (isLoadingMore || !hasMore) return;
    setPaginationError(null);
    setIsLoadingMore(true);
    try {
      // The public storefront API currently returns its complete active
      // catalog in the server-rendered response. Reveal its next local page
      // here without inventing an unsupported pagination endpoint. Yield once
      // so assistive technology and the inline skeleton can announce loading.
      await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
      setDisplayedCount((count) => Math.min(count + CATALOG_PAGE_SIZE, visible.length));
    } catch (error) {
      setPaginationError(error instanceof Error ? error.message : "Could not load more products.");
    } finally {
      setIsLoadingMore(false);
    }
  }, [hasMore, isLoadingMore, visible.length]);

  const sentinelRef = useInfiniteScroll({
    hasMore,
    isLoading: isLoadingMore,
    onLoadMore: loadMore,
    disabled: Boolean(paginationError),
  });

  function handleAddToCart(product: MerchantProduct) {
    const stock = stockFor(product);
    if (stock && !canAddToCart(stock)) return;
    const available = stock ? availableToSell(stock) : 99;
    const maxStock = !stock ? 99 : available > 0 ? available : stock.allowBackorder ? 99 : 0;
    if (maxStock <= 0) return;
    const item: CartItem = {
      productId: product.id,
      merchantId,
      merchantName,
      payoutAddress,
      title: product.name,
      priceStroops: product.priceStroops,
      assetCode: product.assetCode,
      quantity: 1,
      maxStock,
    };
    addItem(item);
    openDrawer();
  }

  const cartCount = summary.totalQuantity;

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      {/* Search + cart icon row */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "0.25rem" }}>
          <label htmlFor="store-product-search" style={{ fontWeight: 500 }}>
            Search products
          </label>
          <input
            id="store-product-search"
            type="search"
            className="order-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search this store"
          />
        </div>

        {/* Cart badge button */}
        <button
          type="button"
          aria-label={
            cartCount > 0 ? `Open cart — ${cartCount} items` : "Open cart"
          }
          onClick={openDrawer}
          data-testid="cart-open-btn"
          style={{
            position: "relative",
            marginTop: "1.5rem",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: "2.75rem",
            height: "2.75rem",
            borderRadius: "0.625rem",
            border: "1px solid #d1d5db",
            background: "#f9fafb",
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          {/* Cart SVG icon */}
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="9" cy="21" r="1" />
            <circle cx="20" cy="21" r="1" />
            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
          </svg>
          {cartCount > 0 && (
            <span
              aria-hidden="true"
              style={{
                position: "absolute",
                top: "-0.375rem",
                right: "-0.375rem",
                minWidth: "1.25rem",
                height: "1.25rem",
                padding: "0 0.25rem",
                borderRadius: "9999px",
                background: "#2563eb",
                color: "#fff",
                fontSize: "0.6875rem",
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {cartCount}
            </span>
          )}
        </button>
      </div>

      {uniqueProducts.length === 0 && <p>This store has no active products.</p>}
      {uniqueProducts.length > 0 && visible.length === 0 && (
        <p>No products match that search.</p>
      )}

      <ul
        style={{
          listStyle: "none",
          margin: 0,
          padding: 0,
          display: "grid",
          gap: "0.75rem",
        }}
      >
        {displayedProducts.map((product) => {
          const stock = stockFor(product);
          const blocked = stock ? !canAddToCart(stock) : false;
          return (
          <li
            key={product.id}
            className="card"
            style={{ padding: "0.875rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}
          >
            <h2 style={{ margin: 0, fontSize: "1rem" }}>{product.name}</h2>
            <StockDepletionPanel
              merchantId={merchantId}
              stock={stock}
              loading={!stock && !checked[`${merchantId}/${product.id}`]}
              mode="card"
            />
            {product.description && (
              <p style={{ margin: 0, color: "#6b7280", fontSize: "0.875rem" }}>
                {product.description}
              </p>
            )}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "0.5rem",
                flexWrap: "wrap",
              }}
            >
              <p style={{ margin: 0, fontWeight: 600 }}>
                {formatPrice(product.priceStroops)}
              </p>
              <button
                type="button"
                onClick={() => handleAddToCart(product)}
                disabled={blocked}
                data-testid={`add-to-cart-${product.id}`}
                style={{
                  padding: "0.4375rem 0.875rem",
                  borderRadius: "0.5rem",
                  border: "none",
                  background: blocked ? "#d1d5db" : "#2563eb",
                  color: "#fff",
                  fontWeight: 600,
                  fontSize: "0.8125rem",
                  cursor: blocked ? "not-allowed" : "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                Add to cart
              </button>
            </div>
            <button
              type="button"
              aria-expanded={expandedId === product.id}
              onClick={() => setExpandedId((current) => (current === product.id ? null : product.id))}
              style={{ alignSelf: "flex-start", background: "none", border: "none", padding: 0, color: "#2563eb", cursor: "pointer", fontSize: "0.75rem" }}
            >
              {expandedId === product.id ? "Hide details" : "View details"}
            </button>
            {expandedId === product.id && (
              <StockDepletionPanel
                merchantId={merchantId}
                stock={stock}
                loading={!stock && !checked[`${merchantId}/${product.id}`]}
                mode="detail"
              />
            )}
          </li>
          );
        })}
      </ul>

      {hasMore && (
        <div
          ref={sentinelRef}
          aria-live="polite"
          aria-busy={isLoadingMore}
          style={{ minHeight: "1px" }}
          data-testid="storefront-load-more-sentinel"
        >
          {isLoadingMore && (
            <ul aria-label="Loading more products" style={{ listStyle: "none", margin: "0.75rem 0 0", padding: 0, display: "grid", gap: "0.75rem" }}>
              <li className="card" aria-hidden="true" style={{ minHeight: "10rem", padding: "0.875rem", background: "linear-gradient(90deg, #f3f4f6 25%, #e5e7eb 37%, #f3f4f6 63%)", backgroundSize: "400% 100%" }} />
            </ul>
          )}
        </div>
      )}

      {paginationError && (
        <div role="alert">
          <p>{paginationError}</p>
          <button type="button" onClick={() => void loadMore()}>Try again</button>
        </div>
      )}

      {uniqueProducts.length > 0 && visible.length > 0 && !hasMore && !isLoadingMore && (
        <p role="status">You&apos;ve reached the end of this catalog.</p>
      )}
    </section>
  );
}
