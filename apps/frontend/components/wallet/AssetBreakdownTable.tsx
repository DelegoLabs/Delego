/**
 * AssetBreakdownTable Component
 *
 * Renders an asset breakdown table (Asset Code, Balance, Issuer Domain via TOML lookup, Explorer link).
 * Formats numbers, handles XLM native asset, and links to stellar.expert according to network.
 */

"use client";

import { useMemo, useState } from "react";
import type { HorizonBalance } from "../../hooks/useBalanceHistory";
import { useTomlCache } from "../../hooks/useTomlCache";

export interface AssetBreakdownTableProps {
  balances: HorizonBalance[];
  horizonUrl: string;
  isLiveNetwork: boolean;
}

type SortKey = "asset" | "balance" | "domain";
type SortDirection = "asc" | "desc";

interface AssetRow {
  item: HorizonBalance;
  /** Original position, used to keep equal values in a stable order. */
  index: number;
  isNative: boolean;
  code: string;
  issuer?: string;
  domain: string;
  balance: number;
}

const assetCollator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});

function compareRows(a: AssetRow, b: AssetRow, key: SortKey): number {
  switch (key) {
    case "asset":
      return (
        assetCollator.compare(a.code, b.code) ||
        assetCollator.compare(a.issuer ?? "", b.issuer ?? "")
      );
    case "balance": {
      const aIsValid = Number.isFinite(a.balance);
      const bIsValid = Number.isFinite(b.balance);
      if (!aIsValid || !bIsValid) {
        return aIsValid === bIsValid ? 0 : aIsValid ? -1 : 1;
      }
      return a.balance - b.balance;
    }
    case "domain":
      return assetCollator.compare(a.domain, b.domain);
  }
}

interface SortableHeaderProps {
  label: string;
  column: SortKey;
  sortKey: SortKey;
  direction: SortDirection;
  onSort: (key: SortKey) => void;
}

function SortableHeader({
  label,
  column,
  sortKey,
  direction,
  onSort,
}: SortableHeaderProps) {
  const isActive = column === sortKey;

  return (
    <th
      scope="col"
      aria-sort={
        isActive ? (direction === "asc" ? "ascending" : "descending") : "none"
      }
    >
      <button
        type="button"
        className="asset-sort-button"
        onClick={() => onSort(column)}
      >
        {label}
        <span className="asset-sort-indicator" aria-hidden="true">
          {isActive ? (direction === "asc" ? "▲" : "▼") : "↕"}
        </span>
      </button>
    </th>
  );
}

function getExplorerUrl(
  assetType: string,
  assetCode?: string,
  assetIssuer?: string,
  isLive?: boolean
): string {
  const baseUrl = isLive
    ? "https://stellar.expert/explorer/public"
    : "https://stellar.expert/explorer/testnet";

  if (assetType === "native" || !assetCode || !assetIssuer) {
    return `${baseUrl}/asset/XLM`;
  }

  return `${baseUrl}/asset/${encodeURIComponent(assetCode)}-${encodeURIComponent(assetIssuer)}`;
}

export function AssetBreakdownTable({
  balances,
  horizonUrl,
  isLiveNetwork,
}: AssetBreakdownTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("asset");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  // Extract issuer IDs for non-native assets
  const issuerIds = balances
    .filter((b) => b.asset_type !== "native" && !!b.asset_issuer)
    .map((b) => b.asset_issuer!);

  const { getIssuerDomain } = useTomlCache(issuerIds, horizonUrl);

  const rows = useMemo<AssetRow[]>(
    () =>
      balances.map((item, index) => {
        const isNative = item.asset_type === "native";
        const code = isNative ? "XLM" : (item.asset_code ?? "Unknown");
        const issuer = item.asset_issuer;
        const domain = isNative
          ? "stellar.org"
          : issuer
            ? getIssuerDomain(issuer)
            : "N/A";

        return {
          item,
          index,
          isNative,
          code,
          issuer,
          domain,
          balance: Number.parseFloat(item.balance),
        };
      }),
    [balances, getIssuerDomain]
  );

  const sortedRows = useMemo(() => {
    const directionMultiplier = sortDirection === "asc" ? 1 : -1;

    return [...rows].sort((a, b) => {
      const comparison = compareRows(a, b, sortKey);
      return comparison === 0
        ? a.index - b.index
        : comparison * directionMultiplier;
    });
  }, [rows, sortKey, sortDirection]);

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDirection("asc");
  };

  if (!balances || balances.length === 0) {
    return null;
  }

  return (
    <div className="asset-table-wrap">
      <table className="asset-table" aria-label="Asset balances breakdown">
        <thead>
          <tr>
            <SortableHeader
              label="Asset"
              column="asset"
              sortKey={sortKey}
              direction={sortDirection}
              onSort={handleSort}
            />
            <SortableHeader
              label="Balance"
              column="balance"
              sortKey={sortKey}
              direction={sortDirection}
              onSort={handleSort}
            />
            <SortableHeader
              label="Issuer Domain"
              column="domain"
              sortKey={sortKey}
              direction={sortDirection}
              onSort={handleSort}
            />
            <th scope="col" className="text-right">
              Explorer
            </th>
          </tr>
        </thead>
        <tbody>
          {sortedRows.map(({ item, index, isNative, code, issuer, domain }) => {
            const explorerUrl = getExplorerUrl(
              item.asset_type,
              item.asset_code,
              item.asset_issuer,
              isLiveNetwork
            );

            return (
              <tr key={code + (issuer ?? "") + index}>
                <td>
                  <div className="asset-code-cell">
                    <span
                      className={`asset-avatar ${isNative ? "native" : ""}`}
                    >
                      {code.slice(0, 3).toUpperCase()}
                    </span>
                    <div>
                      <span className="asset-code-badge">{code}</span>
                      {isNative && (
                        <span className="asset-subtitle">Native Token</span>
                      )}
                    </div>
                  </div>
                </td>
                <td className="font-mono">
                  {parseFloat(item.balance).toLocaleString(undefined, {
                    maximumFractionDigits: 7,
                    minimumFractionDigits: 2,
                  })}
                </td>
                <td>
                  <span className="asset-issuer-domain">{domain}</span>
                </td>
                <td className="text-right">
                  <a
                    href={explorerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="asset-explorer-link"
                    title={`View ${code} on Stellar Expert`}
                    aria-label={`View ${code} on Stellar Expert explorer`}
                  >
                    View ↗
                  </a>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
