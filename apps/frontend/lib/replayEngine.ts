/**
 * Replay Engine for Offline Queue (#618)
 * Replays pending mutations upon network reconnection or periodic sweep.
 * Ensures order-preservation per resource and handles 409 Conflicts cleanly.
 */

import {
  getQueuedMutations,
  updateMutationStatus,
  removeMutation,
  type QueuedMutation,
} from "./offlineQueue";
import { api } from "./api";

let isReplaying = false;

export interface ReplayResult {
  replayed: number;
  conflicts: number;
  quarantined: number;
}

/**
 * Replay all pending mutations in the queue in FIFO order.
 */
export async function replayOfflineQueue(): Promise<ReplayResult> {
  if (isReplaying || typeof navigator === "undefined" || !navigator.onLine) {
    return { replayed: 0, conflicts: 0, quarantined: 0 };
  }

  isReplaying = true;
  let replayedCount = 0;
  let conflictsCount = 0;
  let quarantinedCount = 0;

  try {
    const queue = await getQueuedMutations();
    const pending = queue.filter((m) => m.status === "pending");

    // Group by resourceId to preserve per-resource sequence
    const resourceGroups = new Map<string, QueuedMutation[]>();
    for (const item of pending) {
      const existing = resourceGroups.get(item.resourceId) ?? [];
      resourceGroups.set(item.resourceId, [...existing, item]);
    }

    for (const [, items] of resourceGroups) {
      for (const item of items) {
        await updateMutationStatus(item.id, "replaying");

        try {
          let res: {
            error?: { message?: string; status?: number; code?: string };
            data?: unknown;
          } | null = null;

          if (item.mutationClass === "approve_order") {
            res = (await api.approveOrder(item.resourceId)) as typeof res;
          } else if (item.mutationClass === "reject_order") {
            const reason = (item.payload.reason as string) ?? undefined;
            const reasonCode = (item.payload.reasonCode as string) ?? undefined;
            res = (await api.rejectOrder(
              item.resourceId,
              reason,
              reasonCode
            )) as typeof res;
          } else if (item.mutationClass === "update_delegation") {
            res = (await api.updateDelegation(
              item.resourceId,
              item.payload
            )) as typeof res;
          } else if (item.mutationClass === "revoke_delegation") {
            res = (await api.revokeDelegation(item.resourceId)) as typeof res;
          }

          if (res?.error) {
            const errorStatus = res.error.status;
            const isConflict =
              errorStatus === 409 ||
              res.error.code === "CONFLICT" ||
              res.error.message?.toLowerCase().includes("conflict") ||
              res.error.message?.toLowerCase().includes("stale");

            if (isConflict) {
              conflictsCount++;
              await updateMutationStatus(item.id, "conflict", {
                errorMessage:
                  res.error.message ?? "State changed while offline",
                conflictServerState:
                  (res.data as Record<string, unknown>) ?? undefined,
              });
              // Stop replaying subsequent mutations for this specific resource to avoid cascade errors
              break;
            } else if (
              errorStatus === 400 ||
              errorStatus === 422 ||
              errorStatus === 404
            ) {
              quarantinedCount++;
              await updateMutationStatus(item.id, "quarantined", {
                errorMessage: res.error.message ?? "Permanent server rejection",
              });
              break;
            } else {
              // Temporary error / network glitch — revert to pending for next retry sweep
              await updateMutationStatus(item.id, "pending");
              break;
            }
          } else {
            // Successfully replayed! Remove from queue.
            replayedCount++;
            await removeMutation(item.id);
          }
        } catch (err) {
          // Revert to pending on unexpected failure
          await updateMutationStatus(item.id, "pending", {
            errorMessage:
              err instanceof Error ? err.message : "Replay attempt failed",
          });
          break;
        }
      }
    }
  } finally {
    isReplaying = false;
  }

  return {
    replayed: replayedCount,
    conflicts: conflictsCount,
    quarantined: quarantinedCount,
  };
}

/** Initialize online event listener and periodic sweep for background replay. */
export function initReplayEngine(): () => void {
  if (typeof window === "undefined") return () => {};

  const handleOnline = () => {
    void replayOfflineQueue();
  };

  window.addEventListener("online", handleOnline);

  // Periodic sweep every 45 seconds when online
  const timer = setInterval(() => {
    if (navigator.onLine) {
      void replayOfflineQueue();
    }
  }, 45_000);

  // Trigger initial replay if online
  if (navigator.onLine) {
    void replayOfflineQueue();
  }

  return () => {
    window.removeEventListener("online", handleOnline);
    clearInterval(timer);
  };
}
