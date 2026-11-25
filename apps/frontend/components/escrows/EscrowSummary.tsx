import type { Escrow } from "@delegolabs/types";
import { Amount } from "@delegolabs/ui";
import { useCurrency } from "../../hooks/useCurrency";

interface EscrowSummaryProps {
  escrows: Escrow[];
}

function hasStatus(escrow: Escrow, status: "funded" | "disputed" | "released") {
  return escrow.status.toLowerCase() === status;
}

export function EscrowSummary({ escrows }: EscrowSummaryProps) {
  const { currencyId, rate } = useCurrency();
  const fundedCount = escrows.filter((escrow) =>
    hasStatus(escrow, "funded")
  ).length;
  const disputedCount = escrows.filter((escrow) =>
    hasStatus(escrow, "disputed")
  ).length;
  const releasedCount = escrows.filter((escrow) =>
    hasStatus(escrow, "released")
  ).length;
  const lockedAmount = escrows
    .filter(
      (escrow) => hasStatus(escrow, "funded") || hasStatus(escrow, "disputed")
    )
    .reduce((total, escrow) => total + BigInt(escrow.amount), 0n);

  const items = [
    { label: "Funded", value: fundedCount, testId: "escrow-summary-funded" },
    {
      label: "Disputed",
      value: disputedCount,
      testId: "escrow-summary-disputed",
    },
    {
      label: "Released",
      value: releasedCount,
      testId: "escrow-summary-released",
    },
  ];

  return (
    <section className="escrow-summary" aria-label="Escrow summary">
      <div className="escrow-summary-stat escrow-summary-locked">
        <span className="escrow-summary-label">Total locked</span>
        <strong data-testid="escrow-summary-locked">
          <Amount
            stroops={lockedAmount}
            currency={currencyId}
            xlmUsdRate={rate?.xlmUsdRate}
          />
        </strong>
      </div>
      {items.map((item) => (
        <div className="escrow-summary-stat" key={item.label}>
          <span className="escrow-summary-label">{item.label}</span>
          <strong data-testid={item.testId}>{item.value}</strong>
        </div>
      ))}
    </section>
  );
}
