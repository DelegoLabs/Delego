"use client";

import { useCallback, useRef, useState } from "react";

export interface OptimisticAction<T> {
  type: "UPDATE_STATUS";
  previousState: T;
  optimisticState: T;
  txHashPromise: Promise<string>;
}

export interface UseOptimisticActionOptions<T> {
  /** Called when the transaction promise rejects — triggers rollback. */
  onRollback?: (previousState: T, error: Error) => void;
  /** Called to refetch fresh state after a rollback. */
  onRefetch?: () => Promise<void> | void;
  /** Called to show a warning toast when the transaction fails. */
  onWarning?: (message: string) => void;
}

export interface UseOptimisticActionResult<T> {
  /** The current state (optimistic or confirmed). */
  state: T;
  /** True while an optimistic action is in flight. */
  pending: boolean;
  /** The error from the last failed action, if any. */
  error: string | null;
  /**
   * Execute an optimistic action: immediately apply the optimistic state,
   * then roll back to the previous state if the transaction promise rejects.
   */
  execute: (action: OptimisticAction<T>) => Promise<void>;
  /** Reset the state to a known value (e.g. after refetching). */
  resetState: (newState: T) => void;
}

/**
 * Generic hook for optimistic UI state mutations with automatic rollback on
 * transaction promise rejection.
 *
 * When `execute` is called:
 * 1. The optimistic state is applied immediately.
 * 2. If `txHashPromise` resolves, the optimistic state is kept.
 * 3. If `txHashPromise` rejects, the state is rolled back to `previousState`,
 *    a warning toast is shown, and `onRefetch` is called to get fresh state.
 */
export function useOptimisticAction<T>(
  initialState: T,
  options: UseOptimisticActionOptions<T> = {}
): UseOptimisticActionResult<T> {
  const { onRollback, onRefetch, onWarning } = options;
  const [state, setState] = useState<T>(initialState);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  const execute = useCallback(
    async (action: OptimisticAction<T>) => {
      setPending(true);
      setError(null);

      // Apply optimistic state immediately
      setState(action.optimisticState);

      try {
        await action.txHashPromise;
        // Transaction succeeded — keep the optimistic state
      } catch (err) {
        // Transaction failed — roll back to previous state
        const errorMessage =
          err instanceof Error ? err.message : "Transaction failed";
        setState(action.previousState);
        setError(errorMessage);

        // Show warning toast
        onWarning?.(errorMessage);

        // Call rollback callback
        onRollback?.(action.previousState, err as Error);

        // Refetch fresh state
        if (onRefetch) {
          try {
            await onRefetch();
          } catch {
            // Refetch failure is non-critical — state is already rolled back
          }
        }
      } finally {
        setPending(false);
      }
    },
    [onRollback, onRefetch, onWarning]
  );

  const resetState = useCallback((newState: T) => {
    setState(newState);
  }, []);

  return { state, pending, error, execute, resetState };
}
