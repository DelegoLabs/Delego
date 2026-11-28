"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ApiResponse } from "@delegolabs/types";
import type { CategoryBudgetAllocation } from "../components/settings/budgetAllocationTypes";
import { apiFetch } from "../lib/apiFetch";

export type { CategoryBudgetAllocation } from "../components/settings/budgetAllocationTypes";

/** Budget allocation endpoint for the signed-in user's settings surface. */
const BUDGETS_PATH = "/api/v1/budgets";

/**
 * Amounts travel as decimal strings because stroops can exceed JavaScript's
 * safe integer range. The older `allocatedStroops` / `spentStroops` names are
 * accepted on read so gateways using either shape can be consumed.
 */
type BudgetAllocationWire = Record<string, unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseStroops(value: unknown, field: string): bigint {
  if (typeof value === "bigint" && value >= 0n) return value;
  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    return BigInt(value.trim());
  }
  if (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0
  ) {
    return BigInt(value);
  }
  throw new Error(`Invalid ${field}: expected a non-negative stroops amount`);
}

function parseAllocations(payload: unknown): CategoryBudgetAllocation[] {
  const list = Array.isArray(payload)
    ? payload
    : isRecord(payload)
      ? payload["budgets"]
      : null;

  if (!Array.isArray(list)) {
    throw new Error("Budget allocation response was malformed");
  }

  return list.map((item: unknown, index: number) => {
    if (!isRecord(item)) {
      throw new Error(`Budget allocation at index ${index} was malformed`);
    }
    const category = item["category"];
    if (typeof category !== "string" || category.trim() === "") {
      throw new Error(`Budget allocation at index ${index} is missing a category`);
    }
    return {
      category,
      monthlyLimitStroops: parseStroops(
        item["monthlyLimitStroops"] ?? item["allocatedStroops"],
        `monthly limit for ${category}`
      ),
      currentSpentStroops: parseStroops(
        item["currentSpentStroops"] ?? item["spentStroops"],
        `current spend for ${category}`
      ),
    };
  });
}

function toWire(allocations: CategoryBudgetAllocation[]): BudgetAllocationWire[] {
  return allocations.map((allocation) => ({
    category: allocation.category,
    monthlyLimitStroops: allocation.monthlyLimitStroops.toString(),
    currentSpentStroops: allocation.currentSpentStroops.toString(),
  }));
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

/** Accept both the standard `{ data, error }` envelope and a raw budgets body. */
function payloadOf(response: ApiResponse<unknown>): unknown {
  return isRecord(response) && "data" in response ? response["data"] : response;
}

export interface UseCategoryBudgetsResult {
  /** Current allocations from the API. Empty until the first successful load. */
  budgets: CategoryBudgetAllocation[];
  isLoading: boolean;
  /** Alias for `isLoading`, for callers using the shorter hook convention. */
  loading: boolean;
  error: string | null;
  isSaving: boolean;
  /** Alias for `isSaving`. */
  saving: boolean;
  /** Re-fetch allocations from the API. */
  refresh: () => Promise<void>;
  /** SWR-style alias for `refresh`. */
  mutate: () => Promise<void>;
  /** Persist a full allocation set and update local state from the response. */
  saveBudgets: (allocations: CategoryBudgetAllocation[]) => Promise<void>;
  /** Alias for `saveBudgets`. */
  saveCategoryBudgets: (allocations: CategoryBudgetAllocation[]) => Promise<void>;
}

/**
 * Loads and persists category budget allocations through the budget API.
 * Amounts are converted between decimal strings on the wire and bigint stroops
 * in the UI so slider arithmetic remains exact.
 */
export function useCategoryBudgets(): UseCategoryBudgetsResult {
  const [budgets, setBudgets] = useState<CategoryBudgetAllocation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const saveInFlight = useRef(false);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    setIsLoading(true);
    setError(null);
    try {
      const res: ApiResponse<unknown> = await apiFetch<unknown>(BUDGETS_PATH, {
        signal,
      });
      if (signal?.aborted) return;
      if (res.error) {
        throw new Error(res.error.message);
      }
      setBudgets(parseAllocations(payloadOf(res) ?? []));
    } catch (err) {
      if (!signal?.aborted) {
        setError(errorMessage(err, "Failed to load category budgets"));
      }
    } finally {
      if (!signal?.aborted) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    return () => controller.abort();
  }, [refresh]);

  const saveBudgets = useCallback(
    async (allocations: CategoryBudgetAllocation[]) => {
      if (saveInFlight.current) return;
      saveInFlight.current = true;
      setIsSaving(true);
      setError(null);

      try {
        const res: ApiResponse<unknown> = await apiFetch<unknown>(BUDGETS_PATH, {
          method: "PUT",
          body: JSON.stringify({ budgets: toWire(allocations) }),
        });
        if (res.error) {
          throw new Error(res.error.message);
        }
        const saved = payloadOf(res);
        setBudgets(
          saved === null || saved === undefined
            ? allocations
            : parseAllocations(saved)
        );
      } catch (err) {
        const message = errorMessage(err, "Failed to save category budgets");
        setError(message);
        throw new Error(message);
      } finally {
        setIsSaving(false);
        saveInFlight.current = false;
      }
    },
    []
  );

  return {
    budgets,
    isLoading,
    loading: isLoading,
    error,
    isSaving,
    saving: isSaving,
    refresh: () => refresh(),
    mutate: () => refresh(),
    saveBudgets,
    saveCategoryBudgets: saveBudgets,
  };
}
