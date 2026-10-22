/**
 * Offline cart conflict detection (#1017).
 *
 * While offline the cart keeps the prices and stock it last saw. Before the
 * buyer can check out after reconnecting, that cached view is compared with
 * the live storefront so price changes and stock shortfalls are surfaced
 * (and explicitly resolved) instead of failing — or silently overcharging —
 * at payment time.
 *
 * The cached view is a snapshot in IndexedDB, written alongside the
 * localStorage cart on every change. IndexedDB is the source of truth for
 * "what the buyer agreed to while offline"; when it's unavailable (SSR,
 * private mode) the in-memory cart items are used instead.
 */

import { isCartItem, type CartItem } from "./cart";
import { fetchStorefront } from "./storefront";
import { availableToSell } from "./stockDepletion";

export interface CartConflictItem {
  productId: string;
  title: string;
  cachedPriceStroops: string;
  serverPriceStroops: string;
  cachedQuantity: number;
  availableStock: number;
  conflictType: "price_changed" | "out_of_stock" | "insufficient_quantity";
}

/** How the buyer chose to settle a conflict. */
export type CartConflictResolution = "accept" | "remove";

/** Live price/stock for one cart line, as reported by the server. */
export interface ServerProductSnapshot {
  productId: string;
  priceStroops: string;
  availableStock: number;
}

export const CART_SNAPSHOT_DB_NAME = "delego_cart_db";
export const CART_SNAPSHOT_STORE = "snapshots";
const CART_SNAPSHOT_DB_VERSION = 1;
const CART_SNAPSHOT_KEY = "current";

/**
 * Compares cached cart lines with the server's view. Products missing from
 * the server response are treated as out of stock (delisted). When a line is
 * both re-priced and short on stock, the stock problem wins — it has to be
 * fixed before the price matters.
 */
export function detectCartConflicts(
  cached: CartItem[],
  server: ServerProductSnapshot[]
): CartConflictItem[] {
  const byId = new Map(server.map((p) => [p.productId, p]));
  const conflicts: CartConflictItem[] = [];

  for (const item of cached) {
    const live = byId.get(item.productId);
    const availableStock = live ? Math.max(0, live.availableStock) : 0;
    const serverPriceStroops = live?.priceStroops ?? item.priceStroops;

    let conflictType: CartConflictItem["conflictType"] | null = null;
    if (availableStock === 0) {
      conflictType = "out_of_stock";
    } else if (availableStock < item.quantity) {
      conflictType = "insufficient_quantity";
    } else if (!samePrice(item.priceStroops, serverPriceStroops)) {
      conflictType = "price_changed";
    }

    if (conflictType) {
      conflicts.push({
        productId: item.productId,
        title: item.title,
        cachedPriceStroops: item.priceStroops,
        serverPriceStroops,
        cachedQuantity: item.quantity,
        availableStock,
        conflictType,
      });
    }
  }

  return conflicts;
}

function samePrice(a: string, b: string): boolean {
  try {
    return BigInt(a) === BigInt(b);
  } catch {
    return a === b;
  }
}

/**
 * Applies the buyer's resolution for one conflict. "accept" takes the
 * server's terms — the new price, with quantity and max stock clamped to
 * what's available — and "remove" drops the line. Out-of-stock lines can
 * only be removed, so "accept" removes them too.
 */
export function applyConflictResolution(
  items: CartItem[],
  conflict: CartConflictItem,
  resolution: CartConflictResolution
): CartItem[] {
  if (resolution === "remove" || conflict.conflictType === "out_of_stock") {
    return items.filter((i) => i.productId !== conflict.productId);
  }
  return items.map((i) => {
    if (i.productId !== conflict.productId) return i;
    return {
      ...i,
      priceStroops: conflict.serverPriceStroops,
      maxStock: Math.min(i.maxStock, conflict.availableStock),
      quantity: Math.min(i.quantity, conflict.availableStock),
    };
  });
}

/**
 * Fetches live price/stock for every cart line, one storefront request per
 * merchant. Throws when any storefront can't be reached so the caller keeps
 * its previous conflict state rather than wrongly reporting "all clear".
 */
export async function fetchServerCartSnapshot(
  items: CartItem[]
): Promise<ServerProductSnapshot[]> {
  const merchantIds = [...new Set(items.map((i) => i.merchantId))];
  const storefronts = await Promise.all(
    merchantIds.map((id) => fetchStorefront(id))
  );

  const snapshots: ServerProductSnapshot[] = [];
  storefronts.forEach((storefront, index) => {
    if (!storefront) {
      throw new Error(
        `Could not load live prices for merchant ${merchantIds[index]}.`
      );
    }
    for (const product of storefront.products) {
      if (!product.active) continue;
      snapshots.push({
        productId: product.id,
        priceStroops: product.priceStroops,
        // No stock record means the merchant doesn't track inventory — treat
        // it as unconstrained rather than out of stock.
        availableStock: product.stock
          ? availableToSell(product.stock)
          : Number.MAX_SAFE_INTEGER,
      });
    }
  });
  return snapshots;
}

// ---------------------------------------------------------------------------
// IndexedDB snapshot
// ---------------------------------------------------------------------------

function openSnapshotDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(
        CART_SNAPSHOT_DB_NAME,
        CART_SNAPSHOT_DB_VERSION
      );
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(CART_SNAPSHOT_STORE)) {
          request.result.createObjectStore(CART_SNAPSHOT_STORE);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/** Persists the cart as last seen on this device; ignores failures. */
export async function saveCartSnapshot(items: CartItem[]): Promise<void> {
  const db = await openSnapshotDb();
  if (!db) return;
  try {
    await new Promise<void>((resolve) => {
      const tx = db.transaction(CART_SNAPSHOT_STORE, "readwrite");
      tx.objectStore(CART_SNAPSHOT_STORE).put(
        { items, savedAt: Date.now() },
        CART_SNAPSHOT_KEY
      );
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    });
  } finally {
    db.close();
  }
}

/** Reads the cached cart snapshot, or `null` when none is stored. */
export async function loadCartSnapshot(): Promise<CartItem[] | null> {
  const db = await openSnapshotDb();
  if (!db) return null;
  try {
    return await new Promise<CartItem[] | null>((resolve) => {
      const tx = db.transaction(CART_SNAPSHOT_STORE, "readonly");
      const request = tx
        .objectStore(CART_SNAPSHOT_STORE)
        .get(CART_SNAPSHOT_KEY);
      request.onsuccess = () => {
        const value = request.result as { items?: unknown } | undefined;
        resolve(
          Array.isArray(value?.items) ? value.items.filter(isCartItem) : null
        );
      };
      request.onerror = () => resolve(null);
    });
  } finally {
    db.close();
  }
}
