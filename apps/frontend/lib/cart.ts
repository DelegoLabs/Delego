/**
 * Shopping cart data types and pure utility functions (#917).
 *
 * All monetary math uses BigInt stroops to eliminate floating-point
 * precision errors. 1 XLM = 10,000,000 stroops.
 */

export interface CartItem {
  /** Unique product id from the storefront */
  productId: string;
  /** Merchant who owns this product */
  merchantId: string;
  /** Merchant display name (kept for partition grouping) */
  merchantName: string;
  /** Merchant's Stellar payout address */
  payoutAddress: string;
  /** Product display name */
  title: string;
  /** Price per unit in stroops */
  priceStroops: string;
  /** Asset used to price the product. Optional for carts saved before asset tracking. */
  assetCode?: "USDC" | "XLM" | "EURC";
  /** Current quantity in cart (≥ 1) */
  quantity: number;
  /** Maximum purchasable quantity (from product stock) */
  maxStock: number;
  /** Optional product thumbnail */
  imageUrl?: string;
}

export interface CartSummary {
  items: CartItem[];
  totalQuantity: number;
  /** Sum of (priceStroops × quantity) for all items, as a string */
  subtotalStroops: string;
  currency: string;
}

/** localStorage key for persisted cart state. */
export const CART_STORAGE_KEY = "delego_cart_items";

export function isCartItem(item: unknown): item is CartItem {
  if (item === null || typeof item !== "object") return false;
  const candidate = item as Record<string, unknown>;
  return (
    typeof candidate.productId === "string" &&
    typeof candidate.merchantId === "string" &&
    typeof candidate.title === "string" &&
    typeof candidate.priceStroops === "string" &&
    typeof candidate.quantity === "number" &&
    typeof candidate.maxStock === "number"
  );
}

/**
 * Computes cart summary from an item list using BigInt arithmetic to
 * prevent precision loss.
 */
export function computeCartSummary(items: CartItem[]): CartSummary {
  let subtotal = 0n;
  let totalQuantity = 0;

  for (const item of items) {
    try {
      subtotal += BigInt(item.priceStroops) * BigInt(item.quantity);
    } catch {
      // Malformed priceStroops — skip the item contribution
    }
    totalQuantity += item.quantity;
  }

  return {
    items,
    totalQuantity,
    subtotalStroops: subtotal.toString(),
    currency: "XLM",
  };
}

/** Reads persisted cart items from localStorage; returns [] on any error. */
export function readCartFromStorage(): CartItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(CART_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Basic shape validation — drop anything malformed
    return parsed.filter(isCartItem);
  } catch {
    return [];
  }
}

/** Persists cart items to localStorage; ignores failures silently. */
export function writeCartToStorage(items: CartItem[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
  } catch {
    // Private mode or quota exceeded — in-memory state still updates.
  }
}
