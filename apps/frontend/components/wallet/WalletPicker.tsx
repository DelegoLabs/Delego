"use client";

import { useEffect, useRef } from "react";
import { Badge, Button } from "@delegolabs/ui";
import { useWalletAdapters } from "../../hooks/useWalletAdapters";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import type { WalletId } from "../../lib/wallet";

export interface WalletPickerProps {
  /**
   * Called with the chosen wallet id — the owner (button, wallet page)
   * performs the actual `connect`, so connection state stays where it lives.
   */
  onConnect: (id: WalletId) => void | Promise<unknown>;
  /** True while a connection attempt is in flight. */
  connecting?: boolean;
  /** Wallet currently selected in this browser (marked "Selected"). */
  selectedId?: WalletId | null;
  /** Wallet this owner is connected with, if any. */
  connectedId?: WalletId | null;
  /** Connection error to surface under the list. */
  error?: string | null;
}

function statusFor(wallet: {
  id: WalletId;
  installed: boolean | null;
}): { label: string; tone: "info" | "success" | "warning" | "neutral" } {
  if (wallet.installed === null) {
    return { label: "Checking…", tone: "neutral" };
  }
  if (!wallet.installed) {
    return { label: "Not installed", tone: "warning" };
  }
  return { label: "Ready to connect", tone: "neutral" };
}

/**
 * Lists every registered wallet adapter with its install state: detected
 * wallets get a connect action, missing ones an install link. Rendered
 * inline on the wallet page and inside the connect dialog.
 */
export function WalletPicker({
  onConnect,
  connecting = false,
  selectedId,
  connectedId,
  error,
}: WalletPickerProps) {
  const { wallets } = useWalletAdapters();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      <ul
        aria-label="Available wallets"
        style={{
          listStyle: "none",
          margin: 0,
          padding: 0,
          display: "flex",
          flexDirection: "column",
          gap: "0.5rem",
        }}
      >
        {wallets.map((wallet) => {
          const isConnected = connectedId === wallet.id;
          const isSelected = selectedId === wallet.id;
          const status = isConnected
            ? { label: "Connected", tone: "success" as const }
            : statusFor(wallet);
          const isConnecting = connecting && isSelected && !isConnected;

          return (
            <li
              key={wallet.id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "1rem",
                padding: "0.625rem 0.75rem",
                border: "1px solid var(--color-border, #e5e7eb)",
                borderRadius: "0.5rem",
              }}
            >
              <span
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.25rem",
                  minWidth: 0,
                }}
              >
                <span style={{ fontWeight: 600 }}>{wallet.name}</span>
                <Badge tone={status.tone}>{status.label}</Badge>
              </span>

              {isConnected || wallet.installed === null ? null : (
                <>
                  {wallet.installed === false ? (
                    <a
                      href={wallet.installUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ whiteSpace: "nowrap" }}
                    >
                      Install {wallet.name}
                    </a>
                  ) : (
                    <Button
                      variant="secondary"
                      onClick={() => void onConnect(wallet.id)}
                      disabled={connecting}
                      style={{ whiteSpace: "nowrap" }}
                    >
                      {isConnecting
                        ? "Connecting…"
                        : `Connect with ${wallet.name}`}
                    </Button>
                  )}
                </>
              )}
            </li>
          );
        })}
      </ul>

      {error && (
        <p
          role="alert"
          style={{ margin: 0, color: "var(--color-danger, #991b1b)" }}
        >
          {error}
        </p>
      )}
    </div>
  );
}

export interface WalletPickerModalProps extends WalletPickerProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Dialog wrapper around {@link WalletPicker} — the wallet picker opened by
 * "Connect Wallet" in the header, on the home page, and on the wallet page.
 */
export function WalletPickerModal({
  isOpen,
  onClose,
  ...pickerProps
}: WalletPickerModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useFocusTrap(panelRef, isOpen);

  useEffect(() => {
    if (!isOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="approval-drawer-overlay" onClick={onClose}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Choose a wallet"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--color-surface, #fff)",
          borderRadius: "0.75rem",
          padding: "1.25rem",
          maxWidth: "28rem",
          width: "100%",
          margin: "10vh auto",
          display: "flex",
          flexDirection: "column",
          gap: "1rem",
        }}
      >
        <div>
          <h2 style={{ margin: 0 }}>Choose a wallet</h2>
          <p style={{ margin: "0.5rem 0 0" }}>
            Connect with an installed extension, or install one to continue.
            Your choice is remembered for this browser.
          </p>
        </div>

        <WalletPicker {...pickerProps} />

        <div className="form-actions">
          <Button variant="ghost" type="button" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
