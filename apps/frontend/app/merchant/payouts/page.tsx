"use client";

import { Card } from "@delegolabs/ui";
import { CopyButton } from "../../../components/wallet/CopyButton";
import { useMerchantPayouts } from "../../../hooks/useMerchantPayouts";
import { useNetwork } from "../../../hooks/useNetwork";
import { resolveProofHashExplorerUrl, truncateHash } from "../../../lib/proofAttachments";
import { stroopsToDisplay, totalNetEarningsStroops } from "../../../lib/merchantPayouts";

export default function MerchantPayoutsPage() {
  const { payouts, loading, error } = useMerchantPayouts();
  const { network } = useNetwork();
  const totalNet = totalNetEarningsStroops(payouts);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <h1>Payouts</h1>

      <Card title="Total earnings" ariaLabel="Total net earnings">
        <p style={{ fontSize: "1.5rem", fontWeight: 700, margin: 0 }}>
          {stroopsToDisplay(totalNet)} XLM
        </p>
        <p style={{ fontSize: "0.75rem", color: "#6b7280", margin: 0 }}>
          Net of fees, across {payouts.length} settled payout{payouts.length === 1 ? "" : "s"}.
        </p>
      </Card>

      {error && (
        <div role="alert" style={{ color: "#dc2626", fontSize: "0.8125rem" }}>
          {error}
        </div>
      )}

      {loading ? (
        <p style={{ color: "#6b7280" }}>Loading payout history…</p>
      ) : payouts.length === 0 ? (
        <p style={{ color: "#6b7280" }}>No payouts yet.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8125rem" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid #e5e7eb" }}>
                <th style={{ padding: "0.5rem" }}>Escrow</th>
                <th style={{ padding: "0.5rem" }}>Amount</th>
                <th style={{ padding: "0.5rem" }}>Fee</th>
                <th style={{ padding: "0.5rem" }}>Settled</th>
                <th style={{ padding: "0.5rem" }}>Transaction</th>
              </tr>
            </thead>
            <tbody>
              {payouts.map((payout) => {
                const explorerUrl = resolveProofHashExplorerUrl(payout.transactionHash, network.id);
                return (
                  <tr key={payout.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                    <td style={{ padding: "0.5rem" }}>{payout.escrowId.slice(0, 8)}</td>
                    <td style={{ padding: "0.5rem", fontVariantNumeric: "tabular-nums" }}>
                      {stroopsToDisplay(payout.amountStroops)} {payout.currency}
                    </td>
                    <td style={{ padding: "0.5rem", fontVariantNumeric: "tabular-nums", color: "#6b7280" }}>
                      {stroopsToDisplay(payout.feeStroops)} {payout.currency}
                    </td>
                    <td style={{ padding: "0.5rem" }}>
                      {new Date(payout.ledgerClosedAt).toLocaleString()}
                    </td>
                    <td style={{ padding: "0.5rem" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
                        <code>{truncateHash(payout.transactionHash)}</code>
                        <CopyButton value={payout.transactionHash} label="Copy transaction hash" />
                        {explorerUrl && (
                          <a href={explorerUrl} target="_blank" rel="noopener noreferrer">
                            View
                          </a>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
