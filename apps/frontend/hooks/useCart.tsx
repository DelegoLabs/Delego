"use client";

/**
 * Global shopping cart context (#917).
 *
 * Persists cart items to localStorage so they survive page navigation and
 * browser restarts. Exposes a useCart hook consumed by the CartDrawer,
 * product cards, and the checkout flow.
 *
 * Offline conflicts (#1017): the cart is also snapshotted to IndexedDB, and
 * on reconnect that snapshot is compared with live storefront prices/stock.
 * Any discrepancies are exposed as `conflicts` and block checkout
 * (`canCheckout`) until each is resolved via `resolveConflict`.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from "react";
import {
  computeCartSummary,
  isCartItem,
  readCartFromStorage,
  writeCartToStorage,
  type CartItem,
  type CartSummary,
} from "../lib/cart";
import {
  applyConflictResolution,
  detectCartConflicts,
  fetchServerCartSnapshot,
  loadCartSnapshot,
  saveCartSnapshot,
  type CartConflictItem,
  type CartConflictResolution,
  type ServerProductSnapshot,
} from "../lib/cartConflicts";
import {
  useBroadcastChannel,
  type TabSyncMessage,
} from "./useBroadcastChannel";

// ---------------------------------------------------------------------------
// State & reducer
// ---------------------------------------------------------------------------

interface CartState {
  items: CartItem[];
  /** True once the persisted value has been read on the client */
  hydrated: boolean;
  /** True when the drawer is open */
  drawerOpen: boolean;
  /** Offline cache vs. live server discrepancies awaiting resolution */
  conflicts: CartConflictItem[];
  /** True while a reconnect conflict check is in flight */
  checkingConflicts: boolean;
}

export type {
  CartConflictItem,
  CartConflictResolution,
  ServerProductSnapshot,
} from "../lib/cartConflicts";

type CartAction =
  | { type: "HYDRATE"; items: CartItem[] }
  | { type: "SYNC_ITEMS"; items: CartItem[] }
  | { type: "ADD_ITEM"; item: CartItem }
  | { type: "REMOVE_ITEM"; productId: string }
  | { type: "SET_QUANTITY"; productId: string; quantity: number }
  | { type: "CLEAR" }
  | {
      type: "RESOLVE_CONFLICT";
      conflict: CartConflictItem;
      resolution: CartConflictResolution;
    }
  | { type: "CHECK_CONFLICTS_START" }
  | { type: "SET_CONFLICTS"; conflicts: CartConflictItem[] | null }
  | { type: "OPEN_DRAWER" }
  | { type: "CLOSE_DRAWER" };

function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case "HYDRATE":
      return { ...state, items: action.items, hydrated: true };

    case "SYNC_ITEMS":
      return { ...state, items: action.items, hydrated: true };

    case "ADD_ITEM": {
      const existing = state.items.find(
        (i) => i.productId === action.item.productId
      );
      if (existing) {
        // Increment quantity up to maxStock
        const next = Math.min(
          existing.quantity + action.item.quantity,
          existing.maxStock
        );
        return {
          ...state,
          items: state.items.map((i) =>
            i.productId === action.item.productId
              ? {
                  ...i,
                  quantity: next,
                  assetCode: action.item.assetCode ?? i.assetCode,
                }
              : i
          ),
        };
      }
      const clampedItem: CartItem = {
        ...action.item,
        quantity: Math.min(action.item.quantity, action.item.maxStock),
      };
      return { ...state, items: [...state.items, clampedItem] };
    }

    case "REMOVE_ITEM":
      return {
        ...state,
        items: state.items.filter((i) => i.productId !== action.productId),
      };

    case "SET_QUANTITY": {
      if (action.quantity <= 0) {
        return {
          ...state,
          items: state.items.filter((i) => i.productId !== action.productId),
        };
      }
      return {
        ...state,
        items: state.items.map((i) => {
          if (i.productId !== action.productId) return i;
          return { ...i, quantity: Math.min(action.quantity, i.maxStock) };
        }),
      };
    }

    case "CLEAR":
      return { ...state, items: [], conflicts: [] };

    case "RESOLVE_CONFLICT":
      return {
        ...state,
        items: applyConflictResolution(
          state.items,
          action.conflict,
          action.resolution
        ),
        conflicts: state.conflicts.filter(
          (c) => c.productId !== action.conflict.productId
        ),
      };

    case "CHECK_CONFLICTS_START":
      return { ...state, checkingConflicts: true };

    case "SET_CONFLICTS":
      // `null` means the check failed — keep whatever was already known.
      return {
        ...state,
        checkingConflicts: false,
        conflicts: action.conflicts ?? state.conflicts,
      };

    case "OPEN_DRAWER":
      return { ...state, drawerOpen: true };

    case "CLOSE_DRAWER":
      return { ...state, drawerOpen: false };

    default:
      return state;
  }
}

type CartMutationAction = Extract<
  CartAction,
  {
    type:
      | "ADD_ITEM"
      | "REMOVE_ITEM"
      | "SET_QUANTITY"
      | "CLEAR"
      | "RESOLVE_CONFLICT";
  }
>;

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface CartContextValue {
  summary: CartSummary;
  hydrated: boolean;
  drawerOpen: boolean;
  addItem: (item: CartItem) => void;
  removeItem: (productId: string) => void;
  setQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
  openDrawer: () => void;
  closeDrawer: () => void;
  /** Unresolved offline conflicts for lines still in the cart */
  conflicts: CartConflictItem[];
  checkingConflicts: boolean;
  /** False while any conflict is unresolved or a check is running */
  canCheckout: boolean;
  /** Re-checks the cached cart against the server; also runs on reconnect */
  checkForConflicts: () => Promise<CartConflictItem[]>;
  resolveConflict: (
    productId: string,
    resolution: CartConflictResolution
  ) => void;
}

export interface CartProviderProps {
  children: ReactNode;
  /** Live price/stock lookup. Defaults to the merchant storefront API. */
  fetchServerSnapshot?: (
    items: CartItem[]
  ) => Promise<ServerProductSnapshot[]>;
}

const CartContext = createContext<CartContextValue | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function CartProvider({
  children,
  fetchServerSnapshot = fetchServerCartSnapshot,
}: CartProviderProps) {
  const [state, dispatch] = useReducer(cartReducer, {
    items: [],
    hydrated: false,
    drawerOpen: false,
    conflicts: [],
    checkingConflicts: false,
  });
  const stateRef = useRef(state);
  stateRef.current = state;
  // Latest IndexedDB snapshot write, awaited before comparing so the check
  // never reads a snapshot that lags the cart.
  const pendingSnapshotRef = useRef<Promise<void>>(Promise.resolve());

  const receiveTabMessage = useCallback((message: TabSyncMessage) => {
    if (
      message.type !== "CART_UPDATED" ||
      !Array.isArray(message.payload.items)
    ) {
      return;
    }
    const items = message.payload.items.filter(isCartItem);
    stateRef.current = { ...stateRef.current, items, hydrated: true };
    dispatch({ type: "SYNC_ITEMS", items });
  }, []);
  const { broadcast } = useBroadcastChannel(receiveTabMessage);

  // Hydrate from localStorage on the first client render
  useEffect(() => {
    if (stateRef.current.hydrated) return;
    dispatch({ type: "HYDRATE", items: readCartFromStorage() });
  }, []);

  // Persist every time items change (after hydration)
  useEffect(() => {
    if (!state.hydrated) return;
    writeCartToStorage(state.items);
    pendingSnapshotRef.current = saveCartSnapshot(state.items);
  }, [state.items, state.hydrated]);

  const applyCartAction = useCallback(
    (action: CartMutationAction) => {
      const next = cartReducer(stateRef.current, action);
      stateRef.current = next;
      dispatch(action);
      if (next.hydrated) {
        writeCartToStorage(next.items);
        broadcast("CART_UPDATED", { items: next.items });
      }
    },
    [broadcast]
  );

  const addItem = useCallback((item: CartItem) => {
    applyCartAction({ type: "ADD_ITEM", item });
  }, [applyCartAction]);

  const removeItem = useCallback((productId: string) => {
    applyCartAction({ type: "REMOVE_ITEM", productId });
  }, [applyCartAction]);

  const setQuantity = useCallback((productId: string, quantity: number) => {
    applyCartAction({ type: "SET_QUANTITY", productId, quantity });
  }, [applyCartAction]);

  const clearCart = useCallback(() => {
    applyCartAction({ type: "CLEAR" });
  }, [applyCartAction]);

  const openDrawer = useCallback(() => {
    dispatch({ type: "OPEN_DRAWER" });
  }, []);

  const closeDrawer = useCallback(() => {
    dispatch({ type: "CLOSE_DRAWER" });
  }, []);

  const fetchServerSnapshotRef = useRef(fetchServerSnapshot);
  fetchServerSnapshotRef.current = fetchServerSnapshot;

  const checkForConflicts = useCallback(async () => {
    const current = stateRef.current.items;
    if (current.length === 0) {
      dispatch({ type: "SET_CONFLICTS", conflicts: [] });
      return [];
    }
    dispatch({ type: "CHECK_CONFLICTS_START" });
    try {
      // Compare what was cached on this device (IndexedDB), limited to lines
      // still in the cart; fall back to in-memory items without IDB.
      const inCart = new Set(current.map((i) => i.productId));
      await pendingSnapshotRef.current;
      const snapshot = await loadCartSnapshot();
      const cached =
        snapshot?.filter((i) => inCart.has(i.productId)) ?? current;
      const server = await fetchServerSnapshotRef.current(cached);
      const conflicts = detectCartConflicts(cached, server);
      dispatch({ type: "SET_CONFLICTS", conflicts });
      return conflicts;
    } catch {
      dispatch({ type: "SET_CONFLICTS", conflicts: null });
      return stateRef.current.conflicts;
    }
  }, []);

  // Re-validate the offline cart as soon as the connection comes back.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onOnline = () => {
      void checkForConflicts();
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [checkForConflicts]);

  const resolveConflict = useCallback(
    (productId: string, resolution: CartConflictResolution) => {
      const conflict = stateRef.current.conflicts.find(
        (c) => c.productId === productId
      );
      if (!conflict) return;
      applyCartAction({ type: "RESOLVE_CONFLICT", conflict, resolution });
    },
    [applyCartAction]
  );

  const summary = useMemo(
    () => computeCartSummary(state.items),
    [state.items]
  );

  // Lines removed by other means (drawer, another tab) no longer conflict.
  const conflicts = useMemo(
    () =>
      state.conflicts.filter((c) =>
        state.items.some((i) => i.productId === c.productId)
      ),
    [state.conflicts, state.items]
  );
  const canCheckout = conflicts.length === 0 && !state.checkingConflicts;

  const value = useMemo<CartContextValue>(
    () => ({
      summary,
      hydrated: state.hydrated,
      drawerOpen: state.drawerOpen,
      addItem,
      removeItem,
      setQuantity,
      clearCart,
      openDrawer,
      closeDrawer,
      conflicts,
      checkingConflicts: state.checkingConflicts,
      canCheckout,
      checkForConflicts,
      resolveConflict,
    }),
    [
      summary,
      state.hydrated,
      state.drawerOpen,
      addItem,
      removeItem,
      setQuantity,
      clearCart,
      openDrawer,
      closeDrawer,
      conflicts,
      state.checkingConflicts,
      canCheckout,
      checkForConflicts,
      resolveConflict,
    ]
  );

  return (
    <CartContext.Provider value={value}>{children}</CartContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/** Access the cart state and actions. Must be used within a CartProvider. */
export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) {
    throw new Error("useCart must be used within a CartProvider");
  }
  return ctx;
}
