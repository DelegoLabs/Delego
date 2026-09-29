"use client";

import { useEffect, useRef } from "react";
import type { SupportedWallet, WalletOption } from "../../lib/wallets";

export interface WalletSelectorModalProps {
  open: boolean;
  options: WalletOption[];
  activeId: SupportedWallet;
  pendingId: SupportedWallet | null;
  onSelect: (id: SupportedWallet) => void;
  onConnect: (id: SupportedWallet) => void;
  onClose: () => void;
}

/**
 * Wallet selector modal (issue #774).
 *
 * Lists every registered wallet with its live connection status
 * (installed / available on demand / active). Selecting records the choice
 * (persisted for the tab session); Connect starts that wallet's handshake.
 * Escape closes; focus moves into the dialog on open.
 */
export function WalletSelectorModal({
  open,
  options,
  activeId,
  pendingId,
  onSelect,
  onConnect,
  onClose,
}: WalletSelectorModalProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    dialogRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="wallet-selector-backdrop"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Select a wallet"
        tabIndex={-1}
        className="notice"
        style={{ minWidth: 320, maxWidth: 420, outline: "none" }}
      >
        <strong>Select a wallet</strong>
        <div className="tiny muted" style={{ margin: "4px 0 10px" }}>
          Your choice is remembered for this tab session.
        </div>
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {options.map((option) => {
            const isActive = option.id === activeId;
            const isPending = option.id === pendingId;
            const status = isActive
              ? "active"
              : option.isInstalled
                ? "installed"
                : "available";
            return (
              <li
                key={option.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 0",
                  borderTop: "1px solid var(--line, #242c38)",
                }}
              >
                <span style={{ flex: 1 }}>
                  <span style={{ display: "block", fontWeight: 600 }}>
                    {option.name}
                  </span>
                  <span className="tiny muted">{status}</span>
                </span>
                {!isActive && (
                  <button
                    type="button"
                    onClick={() => onSelect(option.id)}
                    aria-label={`Select ${option.name}`}
                  >
                    Select
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onConnect(option.id)}
                  disabled={isPending}
                  aria-label={`Connect with ${option.name}`}
                >
                  {isPending ? "Connecting…" : isActive ? "Reconnect" : "Connect"}
                </button>
              </li>
            );
          })}
        </ul>
        <div style={{ marginTop: 10, textAlign: "right" }}>
          <button type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
