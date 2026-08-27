"use client";

import { ActivityTimeline } from "@delegolabs/ui";
import { useEscrowTimeline } from "../../hooks/useEscrowTimeline";

export interface TimelineProps {
  escrowId: string;
}

/**
 * Activity timeline for a single escrow — cancellation grace/undo events
 * (#580) and extension-request events (#577) all render here, newest last.
 * Backed by `useEscrowTimeline`, which persists entries per escrow id so the
 * history survives a page reload.
 */
export function Timeline({ escrowId }: TimelineProps) {
  const { events } = useEscrowTimeline(escrowId);
  return (
    <ActivityTimeline
      events={events}
      emptyMessage="No activity recorded yet."
      ariaLabel={`Escrow ${escrowId} activity`}
    />
  );
}
