"use client";

import { useMemo } from "react";
import { ActivityTimeline, type ActivityTimelineEvent } from "@delegolabs/ui";
import { useEscrowTimeline } from "../../hooks/useEscrowTimeline";
import { getDefaultNetworkId, type NetworkId } from "../../lib/networks";
import { ProofExpander } from "../timeline/ProofExpander";

export interface TimelineProps {
  escrowId: string;
  /**
   * Active network, used to resolve proof-hash explorer links (#579). Defaults
   * to the configured default network; the escrow detail page passes the
   * user's live selection from `useNetwork()`.
   */
  networkId?: NetworkId;
}

/**
 * Activity timeline for a single escrow — cancellation grace/undo events
 * (#580), extension-request events (#577), and, when an entry carries
 * delivery-proof attachments, a "View proof" expander (#579). Backed by
 * `useEscrowTimeline`, which persists entries per escrow id so the history
 * survives a page reload.
 */
export function Timeline({ escrowId, networkId }: TimelineProps) {
  const { entries, events } = useEscrowTimeline(escrowId);
  const resolvedNetworkId = networkId ?? getDefaultNetworkId();

  const enriched = useMemo<ActivityTimelineEvent[]>(
    () =>
      events.map((event) => {
        const proofs = entries.find((e) => e.id === event.id)?.proofs;
        if (!proofs || proofs.length === 0) return event;
        return {
          ...event,
          detail: (
            <ProofExpander proofs={proofs} networkId={resolvedNetworkId} />
          ),
        };
      }),
    [entries, events, resolvedNetworkId]
  );

  return (
    <ActivityTimeline
      events={enriched}
      emptyMessage="No activity recorded yet."
      ariaLabel={`Escrow ${escrowId} activity`}
    />
  );
}
