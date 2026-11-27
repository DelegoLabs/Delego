"use client";

import { useCallback, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { TokenAllowanceEntry } from "@delegolabs/types";
import { Button } from "@delegolabs/ui";
import { explorerContractUrl } from "../../lib/contracts";
import type { NetworkId } from "../../lib/networks";
import { CopyButton } from "./CopyButton";

const ALLOWANCE_FORMAT_LOCALE = "en-US";

export interface TokenAllowancesTableProps {
  allowances: TokenAllowanceEntry[];
  loading?: boolean;
  revokingSpenderKey?: string | null;
  onRevoke: (entry: TokenAllowanceEntry) => Promise<void>;
  /** Called when multiple allowances should be revoked in sequence. */
  onRevokeSelected?: (entries: TokenAllowanceEntry[]) => Promise<void>;
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
  onRevokeSelected,
  networkId,
  disabled = false,
}: TokenAllowancesTableProps) {
  const t = useTranslations("tokenAllowances");

  // --- selection state ---
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());

  // --- confirmation modal state ---
  const [confirmOpen, setConfirmOpen] = useState(false);

  // --- sequential-revoke progress state ---
  const [batchProgress, setBatchProgress] = useState<{
    current: number;
    total: number;
    done: boolean;
    error: string | null;
  } | null>(null);

  const modalRef = useRef<HTMLDivElement>(null);

  const rowKey = (entry: TokenAllowanceEntry) =>
    `${entry.tokenAddress}-${entry.spenderAddress}`;

  const allKeys = allowances.map(rowKey);
  const allSelected =
    allKeys.length > 0 && allKeys.every((k) => selectedKeys.has(k));
  const someSelected = selectedKeys.size > 0;

  const toggleAll = useCallback(() => {
    setSelectedKeys(
      allSelected ? new Set() : new Set(allKeys)
    );
  }, [allSelected, allKeys]);

  const toggleRow = useCallback((key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const selectedEntries = allowances.filter((e) => selectedKeys.has(rowKey(e)));

  // ── open the confirmation modal ──────────────────────────────────────────
  const openConfirm = () => {
    setBatchProgress(null);
    setConfirmOpen(true);
  };

  // ── close (only allowed when not mid-batch) ───────────────────────────────
  const closeConfirm = () => {
    if (batchProgress && !batchProgress.done && batchProgress.error === null) {
      return; // block dismiss while actively revoking
    }
    setConfirmOpen(false);
    setBatchProgress(null);
    if (batchProgress?.done) {
      setSelectedKeys(new Set());
    }
  };

  // ── execute sequential revocations ──────────────────────────────────────
  const handleBatchRevoke = async () => {
    if (selectedEntries.length === 0) return;

    setBatchProgress({ current: 0, total: selectedEntries.length, done: false, error: null });

    if (onRevokeSelected) {
      // Delegate entirely to parent if it handles batch natively
      try {
        await onRevokeSelected(selectedEntries);
        setBatchProgress({ current: selectedEntries.length, total: selectedEntries.length, done: true, error: null });
      } catch (err) {
        const msg = err instanceof Error ? err.message : t("batchRevokeError");
        setBatchProgress((prev) =>
          prev ? { ...prev, done: true, error: msg } : null
        );
      }
      return;
    }

    // Fall back: call onRevoke sequentially
    let completed = 0;
    for (const entry of selectedEntries) {
      try {
        await onRevoke(entry);
        completed += 1;
        setBatchProgress({ current: completed, total: selectedEntries.length, done: false, error: null });
      } catch (err) {
        const msg = err instanceof Error ? err.message : t("batchRevokeError");
        setBatchProgress({
          current: completed,
          total: selectedEntries.length,
          done: true,
          error: msg,
        });
        return;
      }
    }

    setBatchProgress({ current: completed, total: selectedEntries.length, done: true, error: null });
  };

  // ────────────────────────────────────────────────────────────────────────
  // Loading / empty states (unchanged)
  // ────────────────────────────────────────────────────────────────────────
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

  const isRevokingBatch =
    confirmOpen && batchProgress !== null && !batchProgress.done && batchProgress.error === null;

  return (
    <>
      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      {someSelected && (
        <div
          className="allowances-batch-toolbar"
          role="toolbar"
          aria-label={t("batchToolbarAriaLabel")}
        >
          <span className="allowances-batch-toolbar__count">
            {t("selectedCount", { count: selectedKeys.size })}
          </span>
          <Button
            variant="destructive"
            size="sm"
            type="button"
            disabled={disabled || isRevokingBatch}
            onClick={openConfirm}
            aria-label={t("revokeSelectedAriaLabel", { count: selectedKeys.size })}
            data-testid="revoke-selected-btn"
          >
            {t("revokeSelected")}
          </Button>
        </div>
      )}

      {/* ── Table ───────────────────────────────────────────────────────── */}
      <div className="asset-table-wrap" data-testid="token-allowances-table-wrap">
        <table className="asset-table" aria-label={t("tableAriaLabel")}>
          <thead>
            <tr>
              <th scope="col" className="asset-table__checkbox-col">
                <input
                  type="checkbox"
                  aria-label={t("selectAllAriaLabel")}
                  checked={allSelected}
                  ref={(el) => {
                    if (el) {
                      el.indeterminate = someSelected && !allSelected;
                    }
                  }}
                  onChange={toggleAll}
                  disabled={disabled}
                  data-testid="select-all-checkbox"
                />
              </th>
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
              const key = rowKey(entry);
              const isRevoking = revokingSpenderKey === key;
              const isChecked = selectedKeys.has(key);
              const formattedAmount = formatStroopsToDecimal(
                entry.allowedAmountStroops,
                ALLOWANCE_FORMAT_LOCALE
              );

              return (
                <tr
                  key={key}
                  data-testid={`allowance-row-${entry.spenderAddress}`}
                  aria-selected={isChecked}
                  className={isChecked ? "allowance-row--selected" : undefined}
                >
                  <td className="asset-table__checkbox-col">
                    <input
                      type="checkbox"
                      aria-label={t("selectRowAriaLabel", { label: entry.spenderLabel })}
                      checked={isChecked}
                      onChange={() => toggleRow(key)}
                      disabled={disabled}
                      data-testid={`select-checkbox-${entry.spenderAddress}`}
                    />
                  </td>
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

      {/* ── Confirmation Modal ──────────────────────────────────────────── */}
      {confirmOpen && (
        <div
          className="allowances-confirm-overlay"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeConfirm();
          }}
          data-testid="batch-revoke-overlay"
        >
          <div
            ref={modalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="batch-revoke-title"
            aria-describedby="batch-revoke-desc"
            className="allowances-confirm-panel"
            data-testid="batch-revoke-modal"
          >
            {/* Header */}
            <div className="allowances-confirm-header">
              <h2 id="batch-revoke-title" className="allowances-confirm-title">
                {t("confirmTitle")}
              </h2>
              <button
                type="button"
                className="allowances-confirm-close"
                onClick={closeConfirm}
                disabled={isRevokingBatch}
                aria-label={t("closeModalAriaLabel")}
                data-testid="batch-revoke-close"
              >
                ✕
              </button>
            </div>

            {/* Description */}
            {!batchProgress && (
              <>
                <p id="batch-revoke-desc" className="allowances-confirm-desc">
                  {t("confirmDesc", { count: selectedEntries.length })}
                </p>

                {/* Allowance list */}
                <ul className="allowances-confirm-list" aria-label={t("confirmListAriaLabel")}>
                  {selectedEntries.map((entry) => (
                    <li key={rowKey(entry)} className="allowances-confirm-list__item">
                      <span className="allowances-confirm-list__label">
                        {entry.spenderLabel}
                      </span>
                      <span className="allowances-confirm-list__detail">
                        {formatStroopsToDecimal(entry.allowedAmountStroops, ALLOWANCE_FORMAT_LOCALE)}{" "}
                        {entry.tokenSymbol}
                      </span>
                    </li>
                  ))}
                </ul>

                {/* Actions */}
                <div className="allowances-confirm-actions">
                  <Button
                    variant="secondary"
                    type="button"
                    onClick={closeConfirm}
                    data-testid="batch-revoke-cancel"
                  >
                    {t("cancel")}
                  </Button>
                  <Button
                    variant="destructive"
                    type="button"
                    onClick={handleBatchRevoke}
                    data-testid="batch-revoke-confirm"
                    aria-label={t("confirmRevokeAriaLabel", { count: selectedEntries.length })}
                  >
                    {t("confirmRevoke", { count: selectedEntries.length })}
                  </Button>
                </div>
              </>
            )}

            {/* Progress feedback */}
            {batchProgress && (
              <div
                className="allowances-confirm-progress"
                data-testid="batch-revoke-progress"
              >
                {!batchProgress.done && (
                  <>
                    <p className="allowances-confirm-desc">
                      {t("batchRevoking", {
                        current: batchProgress.current,
                        total: batchProgress.total,
                      })}
                    </p>
                    <div
                      className="allowances-progress-bar-wrap"
                      role="progressbar"
                      aria-valuenow={batchProgress.current}
                      aria-valuemin={0}
                      aria-valuemax={batchProgress.total}
                      aria-label={t("progressAriaLabel")}
                    >
                      <div
                        className="allowances-progress-bar"
                        style={{
                          width: `${Math.round(
                            (batchProgress.current / batchProgress.total) * 100
                          )}%`,
                        }}
                      />
                    </div>
                  </>
                )}

                {batchProgress.done && !batchProgress.error && (
                  <p
                    className="allowances-confirm-success"
                    role="status"
                    data-testid="batch-revoke-success"
                  >
                    {t("batchRevokeSuccess", { count: batchProgress.current })}
                  </p>
                )}

                {batchProgress.done && batchProgress.error && (
                  <p
                    className="allowances-confirm-error"
                    role="alert"
                    data-testid="batch-revoke-error"
                  >
                    {batchProgress.error}
                  </p>
                )}

                {batchProgress.done && (
                  <div className="allowances-confirm-actions">
                    <Button
                      variant="secondary"
                      type="button"
                      onClick={closeConfirm}
                      data-testid="batch-revoke-done"
                    >
                      {t("close")}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
