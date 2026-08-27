"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@delegolabs/ui";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { detectWalletAdapters } from "../../lib/wallet/registry";

export interface WalletPickerRow {
  id: string;
  name: string;
  installUrl: string;
  detected: boolean;
}

export interface WalletPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Called with the chosen wallet's adapter id. */
  onSelect: (adapterId: string) => void;
  /**
   * Detection results to render. When provided (the connect button passes
   * the sweep it already ran), the modal does not re-detect; when absent it
   * runs its own detection on open.
   */
  adapters?: WalletPickerRow[];
}

/**
 * Lists every registered wallet: detected wallets get a Connect action,
 * missing ones an install link. Rendered from the connect entry points when
 * the user has more than one wallet available, or none.
 */
export function WalletPickerModal({
  isOpen,
  onClose,
  onSelect,
  adapters: adaptersProp,
}: WalletPickerModalProps) {
  const [detected, setDetected] = useState<WalletPickerRow[] | null>(
    adaptersProp ?? null
  );
  const dialogRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(dialogRef, isOpen);

  useEffect(() => {
    if (adaptersProp) {
      setDetected(adaptersProp);
      return;
    }
    if (!isOpen) return;
    let cancelled = false;
    setDetected(null);
    detectWalletAdapters().then((results) => {
      if (cancelled) return;
      setDetected(
        results.map(({ adapter, detected: isDetected }) => ({
          id: adapter.id,
          name: adapter.name,
          installUrl: adapter.installUrl,
          detected: isDetected,
        }))
      );
    });
    return () => {
      cancelled = true;
    };
  }, [isOpen, adaptersProp]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  return (
    <div
      data-testid="wallet-picker-backdrop"
      onClick={onClose}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(15, 23, 42, 0.75)",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        padding: "1rem",
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="wallet-picker-title"
        data-testid="wallet-picker-modal"
        onClick={(event) => event.stopPropagation()}
        style={{
          backgroundColor: "#ffffff",
          borderRadius: "0.75rem",
          maxWidth: "26rem",
          width: "100%",
          padding: "1.75rem",
          boxShadow:
            "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
          border: "1px solid #e5e7eb",
        }}
      >
        <h2
          id="wallet-picker-title"
          style={{
            margin: 0,
            fontSize: "1.25rem",
            fontWeight: 600,
            color: "#111827",
          }}
        >
          Connect a wallet
        </h2>
        <p style={{ margin: "0.5rem 0 1rem", color: "#4b5563" }}>
          Choose the browser extension to connect with.
        </p>

        {detected === null ? (
          <p style={{ color: "#4b5563" }}>Checking installed wallets…</p>
        ) : (
          <ul
            style={{
              listStyle: "none",
              margin: 0,
              padding: 0,
              display: "flex",
              flexDirection: "column",
              gap: "0.75rem",
            }}
          >
            {detected.map((adapter) => (
              <li
                key={adapter.id}
                data-testid={`wallet-option-${adapter.id}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "1rem",
                  border: "1px solid #e5e7eb",
                  borderRadius: "0.5rem",
                  padding: "0.75rem 1rem",
                }}
              >
                <span style={{ fontWeight: 500, color: "#111827" }}>
                  {adapter.name}
                </span>
                {adapter.detected ? (
                  <Button
                    variant="primary"
                    onClick={() => onSelect(adapter.id)}
                  >
                    Connect
                  </Button>
                ) : (
                  <span
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                      fontSize: "0.875rem",
                    }}
                  >
                    <span style={{ color: "#6b7280" }}>Not installed</span>
                    <a
                      href={adapter.installUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Get {adapter.name}
                    </a>
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            marginTop: "1.25rem",
          }}
        >
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
