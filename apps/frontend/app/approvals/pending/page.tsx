"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Amount, Button, Card } from "@delegolabs/ui";
import { usePendingApprovals } from "../../../hooks/usePendingApprovals";
import { useWallet } from "../../../hooks/useWallet";
import { useCurrency } from "../../../hooks/useCurrency";
import { useNow } from "../../../hooks/useNow";
import { useAnnounce } from "../../../hooks/useAnnounce";
import {
  activePendingApprovals,
  totalPendingAmountStroops,
} from "../../../lib/pendingApprovals";
import { PendingApprovalQueue } from "../../../components/approvals/PendingApprovalQueue";
import { HelpLink } from "../../../components/help/HelpLink";

const POLL_INTERVAL_MS = 30_000;

/**
 * Multi-sig dual-control approval dashboard (#780) — the queue of team
 * transactions still waiting on a secondary signature, with a 1-click
 * approve-and-sign action per row.
 *
 * Rows are ordered most-urgent-first and the count feeds the navigation badge
 * (see `components/layout/NavPendingBadge`), so signing here also clears the
 * badge without a refetch.
 */
export default function PendingApprovalsPage() {
  const { items, loading, error, signingIds, sign, refresh } = usePendingApprovals({
    pollIntervalMs: POLL_INTERVAL_MS,
  });
  const { address } = useWallet();
  const { currencyId, rate } = useCurrency();
  const { announce } = useAnnounce();
  const now = useNow(30_000);

  const pending = useMemo(() => activePendingApprovals(items, now), [items, now]);
  const pendingValue = useMemo(() => totalPendingAmountStroops(pending), [pending]);

  const handleSign = async (orderId: string) => {
    const ok = await sign(orderId);
    announce(
      ok
        ? `Signed ${orderId}. Your signature was added.`
        : `Failed to sign ${orderId}.`
    );
    if (!ok) {
      // Surface the failure inline on the row that produced it.
      throw new Error("Signing failed. Please try again.");
    }
  };

  return (
    <div className="settings-page">
      <header className="header">
        <div className="header-row">
          <div>
            <h1>Signatures</h1>
            <p>
              Team transactions that need a second signature before they can execute
              <HelpLink concept="approval" />
            </p>
          </div>
          <div className="form-actions">
            <Button variant="ghost" onClick={() => void refresh()} ariaLabel="Refresh pending approvals">
              Refresh
            </Button>
          </div>
        </div>
      </header>

      <div className="grid">
        <Card title="Awaiting your signature">
          <p className="stat-value stat-neutral">{pending.length}</p>
          <p className="stat-label">Transactions on hold</p>
        </Card>
        <Card title="Value awaiting signature">
          <p className="stat-value">
            <Amount
              stroops={pendingValue}
              currency={currencyId}
              xlmUsdRate={rate?.xlmUsdRate}
            />
          </p>
          <p className="stat-label">Across the queue</p>
        </Card>
      </div>

      <PendingApprovalQueue
        items={items}
        signerAddress={address}
        signingIds={signingIds}
        onSign={handleSign}
        now={now}
        loading={loading}
        error={error}
        onRetry={() => void refresh()}
      />

      <p className="stat-label">
        Already decided?{" "}
        <Link href="/approvals">Review your open approvals</Link> or{" "}
        <Link href="/approvals/history">see your decision history</Link>.
      </p>
    </div>
  );
}
