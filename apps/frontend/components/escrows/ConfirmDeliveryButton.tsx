"use client";

import { useCallback, useState } from "react";
import { Button } from "@delegolabs/ui";
import type { Escrow } from "@delegolabs/types";
import { useEscrowTimeline } from "../../hooks/useEscrowTimeline";
import { escrowKey } from "../../lib/escrows";
import type { ReleaseConfirmPayload } from "../../lib/releaseConfirmation";
import { ReleaseConfirmModal } from "./ReleaseConfirmModal";

export interface ConfirmDeliveryButtonProps {
  escrow: Escrow;
  /**
   * Performs the on-chain Soroban release through the connected wallet.
   * A rejection is surfaced inside the modal and the optimistic timeline
   * entry is rolled back.
   */
  onRelease: (payload: ReleaseConfirmPayload) => Promise<unknown>;
  /** Called after a confirmed release so the caller can flip local state to "Released". */
  onReleased?: (payload: ReleaseConfirmPayload) => void;
  /** Button copy. Defaults to "Confirm delivery". */
  label?: string;
  disabled?: boolean;
}

/**
 * Buyer-facing action for #707: opens `<ReleaseConfirmModal>`, then performs
 * the on-chain release and records it on the escrow timeline.
 *
 * The timeline entry is appended optimistically so the activity feed reflects
 * the attempt immediately; it is confirmed on success and removed entirely if
 * the release fails, matching the optimistic-entry convention used by
 * `ExtensionModal` (#577) and `useCancelGrace` (#580).
 */
export function ConfirmDeliveryButton({
  escrow,
  onRelease,
  onReleased,
  label = "Confirm delivery",
  disabled = false,
}: ConfirmDeliveryButtonProps) {
  const [open, setOpen] = useState(false);
  const { append, update, remove } = useEscrowTimeline(escrowKey(escrow));

  const handleRelease = useCallback(
    async (payload: ReleaseConfirmPayload) => {
      const entryId = append({
        type: "release_confirmed",
        title: "Delivery confirmed — release submitted",
        description: "Awaiting on-chain confirmation.",
        timestamp: new Date().toISOString(),
        status: "pending",
      });

      try {
        await onRelease(payload);
        update(entryId, {
          status: "confirmed",
          title: "Escrow released",
          description:
            payload.feedbackRating !== undefined
              ? `Merchant rated ${payload.feedbackRating}/5.`
              : undefined,
        });
        onReleased?.(payload);
      } catch (err) {
        // Nothing landed on-chain — don't leave a phantom timeline entry.
        remove(entryId);
        throw err;
      }
    },
    [append, update, remove, onRelease, onReleased]
  );

  return (
    <>
      <Button
        variant="primary"
        onClick={() => setOpen(true)}
        disabled={disabled}
        data-testid="confirm-delivery-button"
      >
        {label}
      </Button>

      <ReleaseConfirmModal
        isOpen={open}
        escrow={escrow}
        onClose={() => setOpen(false)}
        onConfirm={handleRelease}
      />
    </>
  );
}
