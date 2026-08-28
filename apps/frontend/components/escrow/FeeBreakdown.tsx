import type { ReactNode } from "react";
import { Chip, Disclosure } from "@delego/ui";
import type { EscrowFeeBreakdown } from "@delego/types";
import { stroopsToDisplay } from "@delego/utils/currency";

/** Renders "—" instead of false-precision "0"/"0.00" when a value is unavailable */
function formatOrFallback(stroops: bigint | null): string {
  return stroops === null ? "—" : `${stroopsToDisplay(stroops)} XLM`;
}

function formatBasisPoints(bp: number): string {
  return `${(bp / 100).toFixed(2)}%`;
}

function Row({ label, value, strong }: { label: ReactNode; value: string; strong?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem" }}>
      <span style={{ color: "var(--color-text-muted)" }}>{label}</span>
      <span style={{ fontWeight: strong ? 700 : 400 }}>{value}</span>
    </div>
  );
}

export function FeeBreakdown({ fees }: { fees: EscrowFeeBreakdown }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
      <Row label="Gross amount" value={formatOrFallback(fees.grossStroops)} />
      <Row
        label={
          <span style={{ display: "inline-flex", alignItems: "center", gap: "0.375rem" }}>
            Fee{fees.feeBasisPoints !== null ? ` (${formatBasisPoints(fees.feeBasisPoints)})` : ""}
            {fees.isEstimated && <Chip tone="info">Estimated</Chip>}
          </span>
        }
        value={formatOrFallback(fees.feeStroops)}
      />
      <Row label="Net proceeds" value={formatOrFallback(fees.netStroops)} strong />
      {fees.treasuries.length > 0 && (
        <Disclosure summary={`Treasury breakdown (${fees.treasuries.length})`}>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
            {fees.treasuries.map((t) => (
              <Row
                key={t.address}
                label={`${t.name} (${formatBasisPoints(t.splitBasisPoints)})`}
                value={formatOrFallback(t.amountStroops)}
              />
            ))}
          </div>
        </Disclosure>
      )}
    </div>
  );
}
