"use client";

import { useEffect, useRef, useState } from "react";
import type { CurrencyPreference } from "@delegolabs/types";
import { useCurrency } from "../../hooks/useCurrency";
import {
  FIAT_TARGETS,
  type DisplayCurrencyMode,
  type FiatTarget,
} from "../../lib/currencyPreference";

const FIAT_LABELS: Record<FiatTarget, { symbol: string; name: string }> = {
  USD: { symbol: "$", name: "US Dollar" },
  EUR: { symbol: "€", name: "Euro" },
  GBP: { symbol: "£", name: "British Pound" },
  NGN: { symbol: "₦", name: "Nigerian Naira" },
};

export function CurrencyToggleDropdown() {
  const { preference, setCurrencyMode, setTargetFiat, toggleCurrencyMode } =
    useCurrency();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const isCryptoPrimary = preference.mode === "crypto_primary";

  useEffect(() => {
    if (!open) return;
    function onClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
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

  const summaryLabel = isCryptoPrimary
    ? `Crypto · ${preference.targetFiat}`
    : `${preference.targetFiat} (${FIAT_LABELS[preference.targetFiat].symbol}) · Crypto`;

  return (
    <div
      className="currency-toggle-dropdown"
      data-testid="currency-toggle-dropdown"
      ref={containerRef}
      style={{ position: "relative", flexShrink: 0 }}
    >
      <div style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
        <button
          type="button"
          onClick={toggleCurrencyMode}
          className="currency-mode-toggle-button focus-visible-ring"
          data-testid="currency-mode-toggle"
          aria-label={`Toggle currency mode, currently ${
            isCryptoPrimary ? "Crypto primary" : "Fiat primary"
          }`}
          title={`Click to switch to ${
            isCryptoPrimary ? "Fiat primary" : "Crypto primary"
          }`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            padding: "0.4rem 0.5rem",
            border: "1px solid var(--color-border, #e5e7eb)",
            borderRadius: "0.375rem 0 0 0.375rem",
            background: isCryptoPrimary
              ? "var(--color-bg-surface, #fff)"
              : "var(--color-accent-bg, #eff6ff)",
            color: "var(--color-text-primary, #111827)",
            fontSize: "0.75rem",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          {isCryptoPrimary ? "XLM/USDC" : FIAT_LABELS[preference.targetFiat].symbol}
        </button>

        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          className="currency-toggle-button focus-visible-ring"
          data-testid="currency-toggle-trigger"
          aria-haspopup="true"
          aria-expanded={open}
          aria-label={`Currency preferences: ${summaryLabel}. Open menu`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.35rem",
            padding: "0.4rem 0.6rem",
            border: "1px solid var(--color-border, #e5e7eb)",
            borderLeft: "none",
            borderRadius: "0 0.375rem 0.375rem 0",
            background: "var(--color-bg-surface, #fff)",
            color: "var(--color-text-primary, #111827)",
            fontSize: "0.8125rem",
            fontWeight: 600,
            cursor: "pointer",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          <span>{preference.targetFiat}</span>
          <span
            aria-hidden="true"
            style={{
              fontSize: "0.625rem",
              color: "var(--color-text-muted, #6b7280)",
            }}
          >
            ▾
          </span>
        </button>
      </div>

      <div
        style={{
          position: "absolute",
          width: "1px",
          height: "1px",
          padding: 0,
          margin: "-1px",
          overflow: "hidden",
          clip: "rect(0, 0, 0, 0)",
          whiteSpace: "nowrap",
          border: 0,
        }}
      >
        <label htmlFor="currency-mode-select">Display Currency Mode</label>
        <select
          id="currency-mode-select"
          data-testid="currency-mode-select"
          value={preference.mode}
          onChange={(e) =>
            setCurrencyMode(e.target.value as DisplayCurrencyMode)
          }
        >
          <option value="crypto_primary">Crypto Primary (USDC/XLM)</option>
          <option value="fiat_primary">Fiat Primary</option>
        </select>

        <label htmlFor="target-fiat-select">Target Fiat Currency</label>
        <select
          id="target-fiat-select"
          data-testid="target-fiat-select"
          value={preference.targetFiat}
          onChange={(e) =>
            setTargetFiat(e.target.value as CurrencyPreference["targetFiat"])
          }
        >
          {FIAT_TARGETS.map((code) => (
            <option key={code} value={code}>
              {`${FIAT_LABELS[code].symbol} ${code} - ${FIAT_LABELS[code].name}`}
            </option>
          ))}
        </select>
      </div>

      {open && (
        <div
          role="menu"
          aria-label="Currency display options"
          style={{
            position: "absolute",
            top: "calc(100% + 0.375rem)",
            right: 0,
            zIndex: 50,
            minWidth: "15rem",
            padding: "0.6rem",
            background: "var(--color-bg-surface, #fff)",
            border: "1px solid var(--color-border, #e5e7eb)",
            borderRadius: "0.5rem",
            boxShadow: "0 8px 24px var(--color-shadow, rgba(0,0,0,0.12))",
            display: "flex",
            flexDirection: "column",
            gap: "0.6rem",
          }}
        >
          <div>
            <div
              style={{
                fontSize: "0.75rem",
                fontWeight: 600,
                color: "var(--color-text-muted, #6b7280)",
                marginBottom: "0.3rem",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              Primary Value
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.35rem" }}>
              <button
                type="button"
                role="menuitemradio"
                aria-checked={isCryptoPrimary}
                data-testid="select-mode-crypto"
                onClick={() => setCurrencyMode("crypto_primary")}
                style={{
                  padding: "0.4rem 0.5rem",
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  borderRadius: "0.375rem",
                  border: isCryptoPrimary
                    ? "1px solid var(--color-primary, #2563eb)"
                    : "1px solid var(--color-border, #e5e7eb)",
                  background: isCryptoPrimary
                    ? "var(--color-accent-bg, #eff6ff)"
                    : "transparent",
                  color: isCryptoPrimary
                    ? "var(--color-primary, #2563eb)"
                    : "var(--color-text-primary, #111827)",
                  cursor: "pointer",
                }}
              >
                🪙 Crypto
              </button>
              <button
                type="button"
                role="menuitemradio"
                aria-checked={!isCryptoPrimary}
                data-testid="select-mode-fiat"
                onClick={() => setCurrencyMode("fiat_primary")}
                style={{
                  padding: "0.4rem 0.5rem",
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  borderRadius: "0.375rem",
                  border: !isCryptoPrimary
                    ? "1px solid var(--color-primary, #2563eb)"
                    : "1px solid var(--color-border, #e5e7eb)",
                  background: !isCryptoPrimary
                    ? "var(--color-accent-bg, #eff6ff)"
                    : "transparent",
                  color: !isCryptoPrimary
                    ? "var(--color-primary, #2563eb)"
                    : "var(--color-text-primary, #111827)",
                  cursor: "pointer",
                }}
              >
                💵 Fiat
              </button>
            </div>
          </div>

          <div>
            <div
              style={{
                fontSize: "0.75rem",
                fontWeight: 600,
                color: "var(--color-text-muted, #6b7280)",
                marginBottom: "0.3rem",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              Target Fiat Currency
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
              {FIAT_TARGETS.map((code) => {
                const isSelected = preference.targetFiat === code;
                const { symbol, name } = FIAT_LABELS[code];
                return (
                  <button
                    key={code}
                    type="button"
                    role="menuitemradio"
                    aria-checked={isSelected}
                    data-testid={`select-fiat-${code}`}
                    onClick={() => {
                      setTargetFiat(code);
                      setOpen(false);
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "0.45rem 0.6rem",
                      borderRadius: "0.375rem",
                      border: "none",
                      background: isSelected
                        ? "var(--color-accent-bg, #eff6ff)"
                        : "transparent",
                      color: "var(--color-text-primary, #111827)",
                      cursor: "pointer",
                      textAlign: "left",
                      fontSize: "0.8125rem",
                    }}
                  >
                    <span>
                      <strong style={{ marginRight: "0.4rem" }}>{symbol}</strong>
                      {code} · <span style={{ color: "#6b7280", fontSize: "0.75rem" }}>{name}</span>
                    </span>
                    {isSelected && (
                      <span aria-hidden="true" style={{ color: "var(--color-primary, #2563eb)", fontWeight: 700 }}>
                        ✓
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export { CurrencyToggleDropdown as CurrencyToggle };
