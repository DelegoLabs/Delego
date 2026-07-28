"use client";

import type { Delegation, UpdateDelegationInput } from "@delego/types";
import { DelegationCard } from "./DelegationCard";

export interface DelegationListProps {
  delegations: Delegation[];
  loading: boolean;
  pendingIds: Set<string>;
  onUpdate: (id: string, input: UpdateDelegationInput) => void | Promise<unknown>;
  onRevoke: (id: string) => void | Promise<unknown>;
}

function DelegationSkeletonCard() {
  return (
    <div className="card skeleton">
      <div className="skeleton-title" />
      <div className="skeleton-text" />
      <div className="skeleton-text" />
      <div className="skeleton-button" />
    </div>
  );
}

/** Grid of delegation cards — shows skeleton placeholders while the initial fetch is in flight. */
export function DelegationList({
  delegations,
  loading,
  pendingIds,
  onUpdate,
  onRevoke,
}: DelegationListProps) {
  if (loading && delegations.length === 0) {
    return (
      <div className="grid">
        <DelegationSkeletonCard />
        <DelegationSkeletonCard />
        <DelegationSkeletonCard />
      </div>
    );
  }

  if (delegations.length === 0) {
    return (
      <div className="card">
        <p>No delegations yet. Grant one to let an AI agent shop on your behalf.</p>
      </div>
    );
  }

  return (
    <div className="grid">
      {delegations.map((delegation) => (
        <DelegationCard
          key={delegation.id}
          delegation={delegation}
          pending={pendingIds.has(delegation.id)}
          onUpdate={onUpdate}
          onRevoke={onRevoke}
        />
      ))}
    </div>
  );
}
