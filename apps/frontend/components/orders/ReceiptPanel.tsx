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
import { orderStatusLabel } from "../../lib/orders";

export interface ReceiptPanelProps {
  order: Order;
}

function formatTimestamp(value: Date | string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

/**
 * Buyer-facing receipt for a single order — line items, fees, escrow id,
 * timestamps, and totals (honoring the display-currency preference). Renders
 * cleanly on its own for `@media print`, and offers a raw JSON download for
 * bookkeeping/expense-reporting integrations.
 */
export function ReceiptPanel({ order }: ReceiptPanelProps) {
  const { currencyId, rate } = useCurrency();
  const subtotal = receiptSubtotalStroops(order);
  const fee = receiptFeeStroops(order);

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
      </div>

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
            {order.lineItems.map((item) => (
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
      </div>
    </Card>
  );
}
