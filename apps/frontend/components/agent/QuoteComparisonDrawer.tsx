"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Badge, Button } from "@delegolabs/ui";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { stroopsToDecimal } from "../../lib/productForm";
import {
  pickBestValueQuote,
  sortQuotes,
  totalCostStroops,
  type MerchantQuote,
  type QuoteSortKey,
} from "../../lib/merchantQuotes";

export interface QuoteComparisonDrawerProps {
  quotes: MerchantQuote[];
  onSelectQuote: (merchantId: string) => void;
  isOpen: boolean;
  onClose: () => void;
}

const SORT_OPTIONS: { key: QuoteSortKey; label: string }[] = [
  { key: "totalCost", label: "Total cost" },
  { key: "speed", label: "Speed" },
  { key: "reputation", label: "Reputation" },
];

const cellStyle = {
  padding: "0.5rem 0.625rem",
  borderBottom: "1px solid #e5e7eb",
} as const;

function pluralDays(days: number): string {
  return `${days} ${days === 1 ? "day" : "days"}`;
}

/**
 * Side drawer comparing the merchant quotes the agent found before an order is
 * placed (#685). Sortable by total cost, delivery speed or reputation, with
 * the agent's best-value pick highlighted.
 */
export function QuoteComparisonDrawer({
  quotes,
  onSelectQuote,
  isOpen,
  onClose,
}: QuoteComparisonDrawerProps) {
  const [sortKey, setSortKey] = useState<QuoteSortKey>("totalCost");
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(panelRef, isOpen);

  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const sorted = useMemo(() => sortQuotes(quotes, sortKey), [quotes, sortKey]);
  const best = useMemo(() => pickBestValueQuote(quotes), [quotes]);

  if (!isOpen) return null;

  return (
    <div
      role="presentation"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        zIndex: 1000,
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="quote-drawer-title"
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          bottom: 0,
          width: "100%",
          maxWidth: 720,
          background: "#fff",
          boxShadow: "-4px 0 24px rgba(0,0,0,0.15)",
          padding: "1.25rem",
          display: "flex",
          flexDirection: "column",
          gap: "1rem",
          overflowY: "auto",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <h2
            id="quote-drawer-title"
            style={{ margin: 0, fontSize: "1.125rem" }}
          >
            Compare merchant quotes
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              border: "none",
              background: "transparent",
              cursor: "pointer",
              fontSize: "1rem",
            }}
          >
            ✕
          </button>
        </div>

        <div
          role="group"
          aria-label="Sort quotes by"
          style={{ display: "flex", gap: "0.375rem", flexWrap: "wrap" }}
        >
          <span
            style={{
              fontSize: "0.8125rem",
              color: "#6b7280",
              alignSelf: "center",
            }}
          >
            Sort by
          </span>
          {SORT_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              type="button"
              aria-pressed={sortKey === opt.key}
              onClick={() => setSortKey(opt.key)}
              style={{
                padding: "0.25rem 0.75rem",
                borderRadius: "9999px",
                border: "1px solid #2563eb",
                background: sortKey === opt.key ? "#2563eb" : "transparent",
                color: sortKey === opt.key ? "#fff" : "#2563eb",
                fontSize: "0.8125rem",
                cursor: "pointer",
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {sorted.length === 0 ? (
          <p style={{ color: "#6b7280" }}>
            The agent hasn&apos;t found any quotes yet.
          </p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "0.875rem",
              }}
            >
              <thead>
                <tr style={{ textAlign: "left", color: "#6b7280" }}>
                  <th scope="col" style={cellStyle}>
                    Merchant
                  </th>
                  <th scope="col" style={cellStyle}>
                    Item
                  </th>
                  <th scope="col" style={cellStyle}>
                    Shipping
                  </th>
                  <th scope="col" style={cellStyle}>
                    Total
                  </th>
                  <th scope="col" style={cellStyle}>
                    Delivery
                  </th>
                  <th scope="col" style={cellStyle}>
                    Reputation
                  </th>
                  <th scope="col" style={cellStyle}>
                    Escrow
                  </th>
                  <th scope="col" style={cellStyle}>
                    <span
                      style={{
                        position: "absolute",
                        width: 1,
                        height: 1,
                        overflow: "hidden",
                        clip: "rect(0 0 0 0)",
                      }}
                    >
                      Actions
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((q) => {
                  const isBest = best?.merchantId === q.merchantId;
                  return (
                    <tr
                      key={q.merchantId}
                      data-recommended={isBest || undefined}
                      style={{
                        background: isBest ? "#eff6ff" : undefined,
                        outline: isBest ? "2px solid #2563eb" : undefined,
                        outlineOffset: -2,
                      }}
                    >
                      <th
                        scope="row"
                        style={{
                          ...cellStyle,
                          textAlign: "left",
                          fontWeight: 600,
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: "0.25rem",
                          }}
                        >
                          {q.merchantName}
                          {isBest && (
                            <Badge
                              tone="info"
                              style={{ alignSelf: "flex-start" }}
                            >
                              Agent&apos;s pick · best value
                            </Badge>
                          )}
                        </div>
                      </th>
                      <td style={cellStyle}>
                        {stroopsToDecimal(q.itemPriceStroops)}
                      </td>
                      <td style={cellStyle}>
                        {stroopsToDecimal(q.shippingPriceStroops)}
                      </td>
                      <td style={{ ...cellStyle, fontWeight: 600 }}>
                        {stroopsToDecimal(totalCostStroops(q))}
                      </td>
                      <td style={cellStyle}>
                        {pluralDays(q.estimatedDeliveryDays)}
                      </td>
                      <td style={cellStyle}>{q.reputationScore}</td>
                      <td style={cellStyle}>
                        <Badge
                          tone={
                            q.contractEscrowSupported ? "success" : "neutral"
                          }
                        >
                          {q.contractEscrowSupported ? "Supported" : "No"}
                        </Badge>
                      </td>
                      <td style={{ ...cellStyle, textAlign: "right" }}>
                        <Button
                          variant={isBest ? "primary" : "ghost"}
                          onClick={() => onSelectQuote(q.merchantId)}
                          ariaLabel={`Select quote from ${q.merchantName}`}
                        >
                          Select
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
