import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useCategoryBudgets } from "../hooks/useCategoryBudgets";
import { apiFetch } from "../lib/apiFetch";

vi.mock("../lib/apiFetch", () => ({
  apiFetch: vi.fn(),
}));

const mockedApiFetch = apiFetch as unknown as ReturnType<typeof vi.fn>;

function ok(data: unknown) {
  return { data, error: null };
}

describe("useCategoryBudgets", () => {
  beforeEach(() => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValue(ok({ budgets: [] }));
  });

  it("loads allocations and converts wire stroops strings to bigint", async () => {
    mockedApiFetch.mockResolvedValueOnce(
      ok({
        budgets: [
          {
            category: "Groceries",
            monthlyLimitStroops: "500000000",
            currentSpentStroops: "320000000",
          },
        ],
      })
    );

    const { result } = renderHook(() => useCategoryBudgets());
    expect(result.current.isLoading).toBe(true);

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.error).toBeNull();
    expect(result.current.budgets).toEqual([
      {
        category: "Groceries",
        monthlyLimitStroops: 500000000n,
        currentSpentStroops: 320000000n,
      },
    ]);
    expect(mockedApiFetch.mock.calls[0]?.[0]).toBe("/api/v1/budgets");
  });

  it("surfaces API errors with a retryable state", async () => {
    mockedApiFetch.mockResolvedValueOnce({
      data: null,
      error: { code: "server_error", message: "Backend unavailable" },
    });

    const { result } = renderHook(() => useCategoryBudgets());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toBe("Backend unavailable");
    expect(result.current.budgets).toEqual([]);
  });

  it("persists bigint allocations as decimal strings and adopts the saved data", async () => {
    const { result } = renderHook(() => useCategoryBudgets());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const savedAllocation = {
      category: "Dining",
      monthlyLimitStroops: 300000000n,
      currentSpentStroops: 285000000n,
    };
    mockedApiFetch.mockResolvedValueOnce(
      ok({
        budgets: [
          {
            category: "Dining",
            monthlyLimitStroops: "300000000",
            currentSpentStroops: "285000000",
          },
        ],
      })
    );

    await act(async () => {
      await result.current.saveBudgets([savedAllocation]);
    });

    expect(mockedApiFetch).toHaveBeenLastCalledWith("/api/v1/budgets", {
      method: "PUT",
      body: JSON.stringify({
        budgets: [
          {
            category: "Dining",
            monthlyLimitStroops: "300000000",
            currentSpentStroops: "285000000",
          },
        ],
      }),
    });
    expect(result.current.budgets).toEqual([savedAllocation]);
    expect(result.current.isSaving).toBe(false);
  });

  it("throws save errors so the card can display them", async () => {
    const { result } = renderHook(() => useCategoryBudgets());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    mockedApiFetch.mockResolvedValueOnce({
      data: null,
      error: { code: "validation_error", message: "Budget limit exceeded" },
    });

    let thrown: unknown;
    await act(async () => {
      try {
        await result.current.saveBudgets([]);
      } catch (err) {
        thrown = err;
      }
    });

    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toBe("Budget limit exceeded");
    expect(result.current.error).toBe("Budget limit exceeded");
    expect(result.current.isSaving).toBe(false);
  });
});
