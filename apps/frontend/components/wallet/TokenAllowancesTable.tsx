"use client";

import { useTranslations } from "next-intl";
import type { TokenAllowanceEntry } from "@delegolabs/types";
import { Button } from "@delegolabs/ui";

const ALLOWANCE_FORMAT_LOCALE = "en-US";
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

export function formatStroopsToDecimal(
  stroops: string,
  locale: string = "en-US"
): string {
  try {
    const formatter = new Intl.NumberFormat(locale);
    const val = BigInt(stroops);
    const divisor = 10_000_000n;
    const whole = val / divisor;
    const fraction = val % divisor;
    if (fraction === 0n) {
      return formatter.format(whole);
    }
    const fractionStr = fraction.toString().padStart(7, "0").replace(/0+$/, "");
    return `${formatter.format(whole)}.${fractionStr}`;
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
  const t = useTranslations("tokenAllowances");

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
        {t("empty")}
      </p>
    );
  }

  return (
    <div className="asset-table-wrap" data-testid="token-allowances-table-wrap">
      <table className="asset-table" aria-label={t("tableAriaLabel")}>
        <thead>
          <tr>
            <th scope="col">{t("columns.spender")}</th>
            <th scope="col">{t("columns.token")}</th>
            <th scope="col">{t("columns.allowance")}</th>
            <th scope="col">{t("columns.expiryLedger")}</th>
            <th scope="col" className="text-right">
              {t("columns.action")}
            </th>
          </tr>
        </thead>
        <tbody>
          {allowances.map((entry) => {
            const rowKey = `${entry.tokenAddress}-${entry.spenderAddress}`;
            const isRevoking = revokingSpenderKey === rowKey;
            const formattedAmount = formatStroopsToDecimal(
              entry.allowedAmountStroops,
              ALLOWANCE_FORMAT_LOCALE
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
                        label={t("copyAddressLabel", { label: entry.spenderLabel })}
                      >
                        Copy
                      </CopyButton>
                      <a
                        href={explorerContractUrl(networkId, entry.spenderAddress)}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ marginLeft: "0.25rem", fontSize: "0.75rem" }}
                        title={t("viewOnExplorer")}
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
                      {t("noExpiry")}
                    </span>
                  )}
                </td>
                <td className="text-right">
                  <Button
                    variant="destructive"
                    type="button"
                    disabled={disabled || isRevoking}
                    onClick={() => onRevoke(entry)}
                    aria-label={t("revokeAriaLabel", { label: entry.spenderLabel })}
                    data-testid={`revoke-btn-${entry.spenderAddress}`}
                  >
                    {isRevoking ? t("revoking") : t("revoke")}
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
