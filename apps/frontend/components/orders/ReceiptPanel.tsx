"use client";

import { Amount, Button, Card } from "@delegolabs/ui";
import type { Order } from "@delegolabs/types";
import { useCurrency } from "../../hooks/useCurrency";
import { downloadBlob } from "../../lib/download";
import {
  buildReceiptRecord,
  receiptFeeStroops,
  receiptFilename,
  receiptSubtotalStroops,
} from "../../lib/receipts";
import { computeTaxBreakdown } from "../../lib/taxBreakdown";
import { TaxBreakdownPanel } from "./TaxBreakdownPanel";
import { orderStatusLabel } from "../../lib/orders";
import { DownloadInvoiceButton } from "./DownloadInvoiceButton";

export interface ReceiptPanelProps {
  order: Order;
  /** ISO country code used to resolve the sales tax / VAT rate. */
  jurisdictionCode?: string;
  /** Order category, e.g. "digital" to zero-rate the breakdown. */
  category?: string;
}

function formatTimestamp(value?: Date | string | null): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

/**
 * Buyer-facing receipt for a single order — line items, fees, escrow id,
 * timestamps, and totals (honoring the display-currency preference). Renders
 * cleanly on its own for `@media print`, and offers a raw JSON download for
 * bookkeeping/expense-reporting integrations.
 */
export function ReceiptPanel({ order, jurisdictionCode, category }: ReceiptPanelProps) {
  const { currencyId, rate } = useCurrency();
  const subtotal = receiptSubtotalStroops(order);
  const fee = receiptFeeStroops(order);
  const giftOptions = order.giftOptions ?? order.metadata?.giftOptions;
  const tax = computeTaxBreakdown({
    subtotalStroops: subtotal,
    networkFeeStroops: fee,
    category: category ?? (order as { category?: string | null }).category,
    jurisdictionCode,
  });

  const handleDownload = () => {
    const record = buildReceiptRecord(order);
    const blob = new Blob([JSON.stringify(record, null, 2)], { type: "application/json" });
    downloadBlob(receiptFilename(order), blob);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <Card
      id="receipt-panel"
      className="receipt-panel"
      title="Receipt"
      ariaLabel={`Receipt for order ${order.id}`}
    >
      <div className="receipt-header no-print">
        <Button variant="secondary" onClick={handlePrint}>
          Print
        </Button>
        <Button variant="ghost" onClick={handleDownload}>
          Download JSON
        </Button>
        <DownloadInvoiceButton order={order} variant="primary" />
      </div>

      {giftOptions?.isGift && (
        <div
          data-testid="order-gift-details"
          className="receipt-gift-details"
          style={{
            margin: "1rem 0",
            padding: "1rem",
            borderRadius: "0.5rem",
            backgroundColor: "#fef3c7",
            border: "1px solid #f59e0b",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.375rem" }}>
            <span role="img" aria-label="gift">🎁</span>
            <strong style={{ fontSize: "0.875rem", color: "#92400e" }}>Gift Order</strong>
          </div>
          {giftOptions.recipientName && (
            <p style={{ margin: "0 0 0.25rem 0", fontSize: "0.8125rem", color: "#78350f" }}>
              <strong>Recipient:</strong> <span data-testid="gift-recipient-name">{giftOptions.recipientName}</span>
            </p>
          )}
          {giftOptions.giftMessage && (
            <div style={{ fontSize: "0.8125rem", color: "#78350f" }}>
              <strong>Gift message:</strong>
              <blockquote
                data-testid="order-gift-message"
                style={{
                  margin: "0.25rem 0 0 0",
                  padding: "0.5rem 0.75rem",
                  background: "#fff",
                  borderRadius: "0.375rem",
                  borderLeft: "3px solid #d97706",
                  fontStyle: "italic",
                  color: "#1f2937",
                }}
              >
                {giftOptions.giftMessage}
              </blockquote>
            </div>
          )}
        </div>
      )}

      <dl className="receipt-meta">
        <div className="receipt-meta-row">
          <dt>Order ID</dt>
          <dd>{order.id}</dd>
        </div>
        <div className="receipt-meta-row">
          <dt>Escrow ID</dt>
          <dd>{order.escrowContractId ?? "Not yet escrowed"}</dd>
        </div>
        <div className="receipt-meta-row">
          <dt>Merchant</dt>
          <dd>{order.merchantId}</dd>
        </div>
        <div className="receipt-meta-row">
          <dt>Status</dt>
          <dd>{orderStatusLabel(order.status)}</dd>
        </div>
        <div className="receipt-meta-row">
          <dt>Placed</dt>
          <dd>{formatTimestamp(order.createdAt)}</dd>
        </div>
        <div className="receipt-meta-row">
          <dt>Last updated</dt>
          <dd>{formatTimestamp(order.updatedAt)}</dd>
        </div>
      </dl>

      <div className="comparison-table-wrapper">
        <table className="comparison-table receipt-line-items">
          <thead>
            <tr>
              <th scope="col">Item</th>
              <th scope="col">Qty</th>
              <th scope="col">Unit price</th>
              <th scope="col">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {(order.lineItems ?? []).map((item) => (
              <tr key={item.productId}>
                <td>{item.productId}</td>
                <td>{item.quantity}</td>
                <td>
                  <Amount
                    stroops={item.unitPriceStroops}
                    currency={currencyId}
                    xlmUsdRate={rate?.xlmUsdRate}
                  />
                </td>
                <td>
                  <Amount
                    stroops={item.unitPriceStroops * BigInt(item.quantity)}
                    currency={currencyId}
                    xlmUsdRate={rate?.xlmUsdRate}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="receipt-totals">
        <div className="receipt-totals-row">
          <span>Subtotal</span>
          <Amount stroops={subtotal} currency={currencyId} xlmUsdRate={rate?.xlmUsdRate} />
        </div>
        <div className="receipt-totals-row">
          <span>Fees</span>
          <Amount stroops={fee} currency={currencyId} xlmUsdRate={rate?.xlmUsdRate} />
        </div>
        <div className="receipt-totals-row receipt-totals-total">
          <span>Total</span>
          <strong>
            <Amount stroops={order.totalStroops} currency={currencyId} xlmUsdRate={rate?.xlmUsdRate} />
          </strong>
        </div>
        <div className="receipt-totals-row no-print">
          <TaxBreakdownPanel
            breakdown={tax}
            networkFeeStroops={fee.toString()}
            variant="receipt"
          />
        </div>
      </div>
    </Card>
  );
}
