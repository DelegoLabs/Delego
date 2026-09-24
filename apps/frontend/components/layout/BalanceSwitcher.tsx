"use client";

import { useEffect, useRef, useState } from "react";
import { useNetwork } from "../../hooks/useNetwork";
import { useWallet } from "../../hooks/useWallet";
import { useBalanceHistory, type HorizonBalance } from "../../hooks/useBalanceHistory";
import { CopyButton } from "../wallet/CopyButton";
import { subscribeTxStatus } from "../../services/txMonitor";

/** A balance row in the navbar switcher. */
export interface AssetBalance {
  assetCode: string;
  issuer?: string;
  balance: string;
  usdValue?: string;
}

const DISPLAY_CODES = ["XLM", "USDC", "EURC"] as const;

function formatBalance(balance: string): string {
  const value = Number(balance);
  if (!Number.isFinite(value)) return balance;
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 7,
  });
}

function truncateAddress(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

function rowKey(row: AssetBalance, index: number): string {
  return `${row.assetCode}:${row.issuer ?? "native"}:${index}`;
}

/**
 * XLM plus any USDC and EURC lines on the account. Missing codes still appear
 * at zero so the switcher always offers the three assets.
 */
export function toAssetBalances(balances: HorizonBalance[]): AssetBalance[] {
  const matched: AssetBalance[] = [];
  for (const entry of balances) {
    if (entry.asset_type === "native") {
      matched.push({ assetCode: "XLM", balance: entry.balance });
      continue;
    }
    const code = entry.asset_code?.toUpperCase();
    if (code !== "USDC" && code !== "EURC") continue;
    matched.push({
      assetCode: code,
      issuer: entry.asset_issuer,
      balance: entry.balance,
    });
  }

  const rows: AssetBalance[] = [];
  for (const code of DISPLAY_CODES) {
    const found = matched.filter((row) => row.assetCode === code);
    if (found.length === 0) {
      rows.push({ assetCode: code, balance: "0" });
    } else {
      rows.push(...found);
    }
  }
  return rows;
}

/**
 * Compact navbar control for XLM, USDC, and EURC.
 * Balances reload when the connected account changes (the history hook keys
 * off the address) and when a tracked transaction succeeds.
 */
export function BalanceSwitcher() {
  const { address, isConnected } = useWallet();
  const { network } = useNetwork();
  const { balances, status, refetch } = useBalanceHistory(
    address,
    network.horizonUrl,
    isConnected
  );
  const [open, setOpen] = useState(false);
  const [selectedKey, setSelectedKey] = useState("XLM:native:0");
  const containerRef = useRef<HTMLDivElement>(null);
  const refetchRef = useRef(refetch);
  refetchRef.current = refetch;

  const rows = toAssetBalances(balances);
  const selected = rows.find((row, index) => rowKey(row, index) === selectedKey) ?? rows[0];
  const rowSignature = rows.map((row, index) => rowKey(row, index)).join("|");

  useEffect(() => {
    if (!rowSignature.split("|").includes(selectedKey)) {
      setSelectedKey("XLM:native:0");
    }
  }, [rowSignature, selectedKey]);

  useEffect(() => {
    if (!isConnected) return;
    return subscribeTxStatus((update) => {
      if (update.status === "success") {
        void refetchRef.current();
      }
    });
  }, [isConnected]);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (!isConnected || !selected) return null;

  const summary =
    status === "error"
      ? "Balances unavailable"
      : status === "loading"
        ? "Balances"
        : `${formatBalance(selected.balance)} ${selected.assetCode}`;

  return (
    <div ref={containerRef} style={{ position: "relative", flexShrink: 0 }}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Balances, showing ${summary}. Switch asset`}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "0.4rem",
          padding: "0.4rem 0.7rem",
          border: "1px solid var(--color-border, #e5e7eb)",
          borderRadius: "0.375rem",
          background: "var(--color-bg-surface, #fff)",
          color: "var(--color-text-primary, #111827)",
          fontSize: "0.8125rem",
          fontWeight: 600,
          cursor: "pointer",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        <span>{summary}</span>
        <span aria-hidden="true" style={{ fontSize: "0.625rem", color: "var(--color-text-muted, #6b7280)" }}>
          ▾
        </span>
      </button>

      {open && (
        <ul
          role="menu"
          aria-label="Asset balances"
          style={{
            position: "absolute",
            top: "calc(100% + 0.375rem)",
            right: 0,
            zIndex: 40,
            minWidth: "16rem",
            maxHeight: "18rem",
            overflow: "auto",
            margin: 0,
            padding: "0.25rem",
            listStyle: "none",
            background: "var(--color-bg-surface, #fff)",
            border: "1px solid var(--color-border, #e5e7eb)",
            borderRadius: "0.5rem",
            boxShadow: "0 8px 24px var(--color-shadow, rgba(0,0,0,0.1))",
          }}
        >
          {rows.map((row, index) => {
            const key = rowKey(row, index);
            const active = selected != null && key === rowKey(selected, rows.indexOf(selected));
            return (
              <li key={key} role="none" style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setSelectedKey(key);
                    setOpen(false);
                  }}
                  style={{
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "flex-start",
                    gap: "0.125rem",
                    padding: "0.5rem 0.625rem",
                    border: "none",
                    borderRadius: "0.375rem",
                    background: active ? "var(--color-accent-bg, #eff6ff)" : "transparent",
                    color: "var(--color-text-primary, #111827)",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <span style={{ fontWeight: 600, fontSize: "0.8125rem" }}>
                    {formatBalance(row.balance)} {row.assetCode}
                    {row.usdValue ? ` · ${row.usdValue}` : ""}
                  </span>
                  <span style={{ fontSize: "0.75rem", color: "var(--color-text-muted, #6b7280)" }}>
                    {row.issuer ? truncateAddress(row.issuer) : "Native asset"}
                  </span>
                </button>
                {row.issuer && (
                  <CopyButton value={row.issuer} label={`Copy ${row.assetCode} issuer address`}>
                    Copy
                  </CopyButton>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
