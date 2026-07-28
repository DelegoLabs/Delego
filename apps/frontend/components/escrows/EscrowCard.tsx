import type { Escrow } from "@delego/types";
import { ESCROW_STATUS_META } from "@delego/types";
import { Card } from "@delego/ui";

/** Approximate Stellar ledger close time in seconds */
const LEDGER_CLOSE_SECONDS = 5;

interface EscrowCardProps {
  escrow: Escrow;
}

function formatStroops(stroops: string): string {
  const xlm = Number(stroops) / 10_000_000;
  if (xlm >= 1) return `${xlm.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} XLM`;
  return `${xlm.toFixed(7)} XLM`;
}

function shortenAddress(addr: string): string {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function computeCountdown(
  timeoutLedger: number,
  currentLedger: number | undefined,
  status: string
): { remaining: number; label: string; urgent: boolean } | null {
  if (status !== "Funded" || currentLedger === undefined) return null;
  const ledgersLeft = timeoutLedger - currentLedger;
  const secondsLeft = ledgersLeft * LEDGER_CLOSE_SECONDS;

  if (secondsLeft <= 0) return { remaining: 0, label: "Expired", urgent: true };

  const hours = Math.floor(secondsLeft / 3600);
  const minutes = Math.floor((secondsLeft % 3600) / 60);

  if (hours > 0) {
    return {
      remaining: secondsLeft,
      label: `~${hours}h ${minutes}m`,
      urgent: hours < 1,
    };
  }
  if (minutes > 0) {
    return {
      remaining: secondsLeft,
      label: `~${minutes}m`,
      urgent: minutes < 15,
    };
  }
  return {
    remaining: secondsLeft,
    label: `~${secondsLeft}s`,
    urgent: true,
  };
}

export function EscrowCard({ escrow }: EscrowCardProps) {
  const meta = ESCROW_STATUS_META[escrow.status];
  const countdown = computeCountdown(
    escrow.timeoutLedger,
    escrow.currentLedger,
    escrow.status
  );

  return (
    <Card>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "0.75rem",
        }}
      >
        {/* Header row: escrow ID + status badge */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "0.5rem",
          }}
        >
          <span style={{ fontWeight: 600, fontSize: "0.875rem", color: "#374151" }}>
            Escrow #{escrow.escrowId}
          </span>

          <span
            data-testid="escrow-status-badge"
            style={{
              display: "inline-flex",
              alignItems: "center",
              padding: "0.2rem 0.625rem",
              borderRadius: "9999px",
              fontSize: "0.75rem",
              fontWeight: 600,
              lineHeight: 1.4,
              color: meta.color,
              backgroundColor: meta.bg,
              transition: "opacity 0.2s ease",
            }}
          >
            {meta.label}
          </span>
        </div>

        {/* Detail rows */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
            gap: "0.5rem",
            fontSize: "0.8125rem",
            color: "#6b7280",
          }}
        >
          <div>
            <span style={{ fontWeight: 500, color: "#9ca3af" }}>Amount</span>
            <br />
            <span data-testid="escrow-amount">{formatStroops(escrow.amount)}</span>
          </div>
          <div>
            <span style={{ fontWeight: 500, color: "#9ca3af" }}>Buyer</span>
            <br />
            <span title={escrow.buyer}>{shortenAddress(escrow.buyer)}</span>
          </div>
          <div>
            <span style={{ fontWeight: 500, color: "#9ca3af" }}>Seller</span>
            <br />
            <span title={escrow.seller}>{shortenAddress(escrow.seller)}</span>
          </div>
          <div>
            <span style={{ fontWeight: 500, color: "#9ca3af" }}>Order</span>
            <br />
            <span>{escrow.orderId.slice(0, 8)}…</span>
          </div>
        </div>

        {/* Timeout countdown for funded escrows */}
        {countdown && (
          <div
            data-testid="escrow-countdown"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.375rem",
              padding: "0.375rem 0.625rem",
              borderRadius: "0.375rem",
              fontSize: "0.75rem",
              fontWeight: 600,
              color: countdown.urgent ? "#991b1b" : "#065f46",
              backgroundColor: countdown.urgent ? "#fee2e2" : "#d1fae5",
              width: "fit-content",
              transition: "background-color 0.3s ease, color 0.3s ease",
            }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            {countdown.urgent ? "Expiring soon: " : "Time remaining: "}
            {countdown.label}
          </div>
        )}

        {/* Created date */}
        <div
          style={{
            fontSize: "0.75rem",
            color: "#9ca3af",
          }}
        >
          Created{" "}
          {new Date(escrow.createdAt).toLocaleDateString(undefined, {
            year: "numeric",
            month: "short",
            day: "numeric",
          })}
        </div>
      </div>
    </Card>
  );
}
