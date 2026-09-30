"use client";

import { useCallback, useState } from "react";
import { Button } from "@delegolabs/ui";
import type { Escrow } from "@delegolabs/types";
import { useOptimisticAction } from "../../hooks/useOptimisticAction";
import { requestCancellation } from "../../services/payments";
import { escrowKey } from "../../lib/escrows";

export interface CancelEscrowButtonProps {
  escrow: Escrow;
  /** Called when cancellation is successfully initiated. */
  onCancelled?: (escrowId: string) => void;
  /** Called when cancellation fails and state is rolled back. */
  onCancelFailed?: (escrowId: string, error: string) => void;
  /** Called to refetch fresh escrow state after a failure. */
  onRefetch?: () => Promise<void> | void;
}

/**
 * Cancel Escrow button with optimistic UI and automatic rollback on failure.
 *
 * When clicked:
 * 1. The UI immediately shows the escrow as "Cancelling…"
 * 2. If the on-chain cancellation transaction succeeds, the state is kept
 * 3. If the transaction reverts, the UI rolls back to the previous state,
 *    a warning toast is shown, and fresh state is refetched
 */
export function CancelEscrowButton({
  escrow,
  onCancelled,
  onCancelFailed,
  onRefetch,
}: CancelEscrowButtonProps) {
  const [showWarning, setShowWarning] = useState(false);
  const [warningMessage, setWarningMessage] = useState("");

  const { state, pending, error, execute } = useOptimisticAction(
    { status: escrow.status, isCancelling: false },
    {
      onWarning: (message) => {
        setWarningMessage(message);
        setShowWarning(true);
        // Auto-hide warning after 5 seconds
        setTimeout(() => setShowWarning(false), 5000);
      },
      onRefetch: async () => {
        if (onRefetch) {
          await onRefetch();
        }
      },
    }
  );

  const handleCancel = useCallback(async () => {
    const escrowId = escrowKey(escrow);

    await execute({
      type: "UPDATE_STATUS",
      previousState: { status: escrow.status, isCancelling: false },
      optimisticState: { status: "Cancelling", isCancelling: true },
      txHashPromise: (async () => {
        const res = await requestCancellation(escrowId);
        if (res.error) {
          throw new Error(res.error.message);
        }
        return res.data?.cancellation?.requestedAt ?? "pending";
      })(),
    });

    // Check if the action succeeded (no error)
    if (!error) {
      onCancelled?.(escrowId);
    } else {
      onCancelFailed?.(escrowId, error);
    }
  }, [escrow, execute, error, onCancelled, onCancelFailed]);

  const isCancelling = state.isCancelling || pending;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
      <Button
        variant="secondary"
        onClick={() => void handleCancel()}
        disabled={isCancelling || escrow.status === "Released" || escrow.status === "Refunded"}
        loading={isCancelling}
      >
        {isCancelling ? "Cancelling…" : "Cancel Escrow"}
      </Button>

      {showWarning && (
        <div
          role="alert"
          style={{
            padding: "0.625rem 0.875rem",
            borderRadius: "0.375rem",
            background: "#fef2f2",
            border: "1px solid #fecaca",
            color: "#991b1b",
            fontSize: "0.8125rem",
          }}
        >
          <strong>Cancellation failed:</strong> {warningMessage}. The escrow
          status has been restored to its previous state.
        </div>
      )}

      {error && !showWarning && (
        <span
          role="alert"
          style={{ fontSize: "0.8125rem", color: "#991b1b" }}
        >
          {error}
        </span>
      )}
    </div>
  );
}
