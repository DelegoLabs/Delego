"use client";

import { useCallback, useRef, useState } from "react";
import { api } from "../lib/api";
import type {
  SpendPreviewParams,
  SpendPreviewResult,
} from "../lib/spendSimulator";

export type SimulatorState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "result"; result: SpendPreviewResult }
  | { status: "error"; message: string };

export interface UseSpendSimulatorResult {
  state: SimulatorState;
  /**
   * Trigger a read-only SpendPreview dry-run.
   * Guaranteed non-mutating: calls GET /api/v1/delegations/:id/spend-preview
   * which proxies the contract's read-only `preview_spend` function.
   */
  simulate: (params: SpendPreviewParams) => Promise<void>;
  reset: () => void;
}

/**
 * Drives the Spend Simulator panel. The hook is provably read-only:
 * - It only calls GET endpoints.
 * - It exports no mutation functions (no approve/reject/transfer).
 * - The result type (SpendPreviewResult) carries no transaction hash or
 *   side-effecting data.
 */
export function useSpendSimulator(): UseSpendSimulatorResult {
  const [state, setState] = useState<SimulatorState>({ status: "idle" });
  // Prevent overlapping simulations if the user clicks rapidly.
  const inFlightRef = useRef(false);

  const simulate = useCallback(async (params: SpendPreviewParams) => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setState({ status: "loading" });

    try {
      // GET /api/v1/delegations/:id/spend-preview?amount=<stroops>[&merchant=<id>]
      // This is the only network call this hook makes — read-only by definition.
      const res = await (api as unknown as {
        previewSpend: (
          p: SpendPreviewParams
        ) => Promise<{
          data?: SpendPreviewResult;
          error?: { message: string };
        }>;
      }).previewSpend(params);

      if (res.error) {
        setState({ status: "error", message: res.error.message });
      } else if (res.data) {
        setState({ status: "result", result: res.data });
      } else {
        setState({ status: "error", message: "Empty response from simulator" });
      }
    } catch (err) {
      setState({
        status: "error",
        message:
          err instanceof Error ? err.message : "Simulation failed",
      });
    } finally {
      inFlightRef.current = false;
    }
  }, []);

  const reset = useCallback(() => setState({ status: "idle" }), []);

  return { state, simulate, reset };
}
