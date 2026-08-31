"use client";

import { Card, Amount } from "@delegolabs/ui";
import type { Deltas, PeriodMetrics } from "../../lib/analytics";
import { useCurrency } from "../../hooks/useCurrency";

export interface DeltaCardsProps {
  current: PeriodMetrics;
  deltas: Deltas;
}

function DeltaChip({ delta, inverse = false }: { delta: number | null, inverse?: boolean }) {
  if (delta === null) {
    return <span className="delta-chip delta-neutral">—</span>;
  }
  const isPositive = delta > 0;
  const isZero = delta === 0;
  
  // green/red semantics chosen carefully: spend-down = green (inverse=true)
  let tone = "neutral";
  if (!isZero) {
    if (inverse) {
      tone = isPositive ? "negative" : "positive";
    } else {
      tone = isPositive ? "positive" : "negative";
    }
  }

  const arrow = isPositive ? "▲" : isZero ? "" : "▼";
  const percentage = Math.abs(delta * 100).toFixed(1) + "%";

  return (
    <span 
      className={`delta-chip status-${tone}`} 
      aria-label={isZero ? "No change" : `${isPositive ? 'Increased' : 'Decreased'} by ${percentage}`}
    >
      {arrow} {percentage}
    </span>
  );
}

export function DeltaCards({ current, deltas }: DeltaCardsProps) {
  const { currencyId, rate } = useCurrency();

  return (
    <div className="grid animate-fade-in delta-cards-grid">
      <Card title="Spend">
        <p className="stat-value">
          <Amount
            stroops={current.spend}
            currency={currencyId}
            xlmUsdRate={rate?.xlmUsdRate}
          />
        </p>
        <div className="stat-label">
          <DeltaChip delta={deltas.spendDelta} inverse={true} /> vs previous
        </div>
      </Card>

      <Card title="Orders">
        <p className="stat-value">{current.orderCount}</p>
        <div className="stat-label">
          <DeltaChip delta={deltas.orderCountDelta} /> vs previous
        </div>
      </Card>

      <Card title="Avg Order Value">
        <p className="stat-value">
          <Amount
            stroops={current.avgOrderValue}
            currency={currencyId}
            xlmUsdRate={rate?.xlmUsdRate}
          />
        </p>
        <div className="stat-label">
          <DeltaChip delta={deltas.avgOrderValueDelta} inverse={true} /> vs previous
        </div>
      </Card>

      <Card title="Approval Rate">
        <p className="stat-value">
          {(current.approvalRate * 100).toFixed(1)}%
        </p>
        <div className="stat-label">
          <DeltaChip delta={deltas.approvalRateDelta} /> vs previous
        </div>
      </Card>
    </div>
  );
}
