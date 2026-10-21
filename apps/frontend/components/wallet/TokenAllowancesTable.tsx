"use client";

import type { TokenAllowanceEntry } from "@delegolabs/types";
import { Button } from "@delegolabs/ui";
import { explorerContractUrl } from "../../lib/contracts";
import type { NetworkId } from "../../lib/networks";
import { CopyButton } from "./CopyButton";

export interface TokenAllowancesTableProps {
  allowances: TokenAllowanceEntry[];
  loading?: boolean;
  revokingSpenderKey?: string | null;
  onRevoke: (entry: TokenAllowanceEntry) => Promise<void>;
  networkId: NetworkId;
  disabled?: boolean;
}

export function formatStroopsToDecimal(stroops: string): string {
  try {
    const val = BigInt(stroops);
    const divisor = 10_000_000n;
    const whole = val / divisor;
    const fraction = val % divisor;
    if (fraction === 0n) {
      return whole.toLocaleString();
    }
    const fractionStr = fraction.toString().padStart(7, "0").replace(/0+$/, "");
    return `${whole.toLocaleString()}.${fractionStr}`;
  } catch {
    return stroops;
  }
}

export function TokenAllowancesTable({
  allowances,
  loading = false,
  revokingSpenderKey = null,
  onRevoke,
  networkId,
  disabled = false,
}: TokenAllowancesTableProps) {
  if (loading && allowances.length === 0) {
    return (
      <div className="skeleton-form" data-testid="allowances-loading">
        <div className="skeleton-title" style={{ width: "30%" }} />
        <div className="skeleton-input" style={{ height: "60px" }} />
      </div>
    );
  }

  if (allowances.length === 0) {
    return (
      <p className="settings-toggle-hint" data-testid="allowances-empty">
        No active Soroban token allowances found for this account.
      </p>
    );
  }

  return (
    <div className="asset-table-wrap" data-testid="token-allowances-table-wrap">
      <table className="asset-table" aria-label="Active token allowances">
        <thead>
          <tr>
            <th scope="col">Spender</th>
            <th scope="col">Token</th>
            <th scope="col">Allowance</th>
            <th scope="col">Expiry Ledger</th>
            <th scope="col" className="text-right">
              Action
            </th>
          </tr>
        </thead>
        <tbody>
          {allowances.map((entry) => {
            const rowKey = `${entry.tokenAddress}-${entry.spenderAddress}`;
            const isRevoking = revokingSpenderKey === rowKey;
            const formattedAmount = formatStroopsToDecimal(
              entry.allowedAmountStroops
            );

            return (
              <tr key={rowKey} data-testid={`allowance-row-${entry.spenderAddress}`}>
                <td>
                  <div>
                    <strong>{entry.spenderLabel}</strong>
                    <div
                      style={{
                        fontFamily: "monospace",
                        fontSize: "0.75rem",
                        color: "var(--color-text-muted)",
                        display: "flex",
                        alignItems: "center",
                        gap: "0.25rem",
                        marginTop: "0.25rem",
                      }}
                    >
                      <span title={entry.spenderAddress}>
                        {entry.spenderAddress.slice(0, 6)}…
                        {entry.spenderAddress.slice(-6)}
                      </span>
                      <CopyButton
                        value={entry.spenderAddress}
                        label={`Copy ${entry.spenderLabel} address`}
                      >
                        Copy
                      </CopyButton>
                      <a
                        href={explorerContractUrl(networkId, entry.spenderAddress)}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ marginLeft: "0.25rem", fontSize: "0.75rem" }}
                        title="View contract on explorer"
                      >
                        ↗
                      </a>
                    </div>
                  </div>
                </td>
                <td>
                  <span className="asset-code-badge">{entry.tokenSymbol}</span>
                </td>
                <td className="font-mono">
                  {formattedAmount} {entry.tokenSymbol}
                </td>
                <td>
                  {entry.expirationLedger > 0 ? (
                    <span className="font-mono">#{entry.expirationLedger}</span>
                  ) : (
                    <span className="settings-toggle-hint" style={{ margin: 0 }}>
                      No expiry
                    </span>
                  )}
                </td>
                <td className="text-right">
                  <Button
                    variant="destructive"
                    type="button"
                    disabled={disabled || isRevoking}
                    onClick={() => onRevoke(entry)}
                    aria-label={`Revoke allowance for ${entry.spenderLabel}`}
                    data-testid={`revoke-btn-${entry.spenderAddress}`}
                  >
                    {isRevoking ? "Revoking…" : "Revoke"}
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
