"use client";

import { useEffect, useMemo, useRef } from "react";
import { Amount, Button } from "@delegolabs/ui";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { useCurrency } from "../../hooks/useCurrency";
import {
  encodeCode39,
  invoiceFilename,
  receiptStroops,
  type ReceiptDetails,
} from "../../lib/receiptInvoice";

export interface ReceiptInvoiceModalProps {
  isOpen: boolean;
  receipt: ReceiptDetails | null;
  onClose: () => void;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function Barcode({ value }: { value: string }) {
  const { bars, width } = useMemo(() => encodeCode39(value), [value]);
  return (
    <svg
      className="receipt-invoice-barcode"
      viewBox={`0 0 ${width} 40`}
      preserveAspectRatio="none"
      role="img"
      aria-label={`Barcode for order ${value}`}
    >
      {bars.map((bar) => (
        <rect key={bar.x} x={bar.x} y={0} width={bar.width} height={40} fill="currentColor" />
      ))}
    </svg>
  );
}

/**
 * Itemized proof of purchase / tax invoice for an order (#714). Prices follow
 * the user's display-currency preference, and "Download PDF" uses the
 * browser's print dialog ("Save as PDF") with a print stylesheet that shows
 * only the invoice sheet.
 */
export function ReceiptInvoiceModal({ isOpen, receipt, onClose }: ReceiptInvoiceModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const { currencyId, rate } = useCurrency();
  useFocusTrap(panelRef, isOpen);

  useEffect(() => {
    if (!isOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !receipt) return null;

  const money = (value: string) => (
    <Amount stroops={receiptStroops(value)} currency={currencyId} xlmUsdRate={rate?.xlmUsdRate} />
  );

  function handleDownloadPdf() {
    if (!receipt) return;
    // The document title becomes the default "Save as PDF" filename.
    const previousTitle = document.title;
    document.title = invoiceFilename(receipt);
    window.print();
    document.title = previousTitle;
  }

  return (
    <div className="approval-drawer-overlay" onClick={onClose}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Receipt for order ${receipt.orderId}`}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="print-sheet receipt-invoice"
        style={{
          background: "var(--color-bg-surface, #fff)",
          borderRadius: "0.75rem",
          padding: "1.25rem",
          maxWidth: "36rem",
          width: "100%",
          maxHeight: "90vh",
          overflowY: "auto",
          margin: "5vh auto",
          display: "flex",
          flexDirection: "column",
          gap: "0.75rem",
        }}
      >
        <header className="receipt-invoice-header">
          <div>
            <h2 style={{ margin: 0 }}>Tax invoice</h2>
            <p className="stat-label" style={{ margin: 0 }}>
              {receipt.merchantName} · {formatDate(receipt.date)}
            </p>
          </div>
          <Barcode value={receipt.orderId} />
        </header>

        <dl className="receipt-meta">
          <div className="receipt-meta-row">
            <dt>Order ID</dt>
            <dd>{receipt.orderId}</dd>
          </div>
          <div className="receipt-meta-row">
            <dt>Escrow ID</dt>
            <dd className="receipt-invoice-mono">{receipt.escrowId}</dd>
          </div>
          <div className="receipt-meta-row">
            <dt>Buyer</dt>
            <dd className="receipt-invoice-mono">{receipt.buyerAddress}</dd>
          </div>
          <div className="receipt-meta-row">
            <dt>Merchant</dt>
            <dd>{receipt.merchantName}</dd>
          </div>
        </dl>

        <div className="comparison-table-wrapper">
          <table className="comparison-table receipt-line-items">
            <thead>
              <tr>
                <th scope="col">Item</th>
                <th scope="col">Qty</th>
                <th scope="col">Unit price</th>
                <th scope="col">Total</th>
              </tr>
            </thead>
            <tbody>
              {receipt.items.map((item, index) => (
                <tr key={`${item.title}-${index}`}>
                  <td>{item.title}</td>
                  <td>{item.quantity}</td>
                  <td>{money(item.unitPrice)}</td>
                  <td>{money(item.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="receipt-totals">
          <div className="receipt-totals-row">
            <span>Subtotal</span>
            {money(receipt.subtotal)}
          </div>
          <div className="receipt-totals-row">
            <span>Network fee</span>
            {money(receipt.networkFee)}
          </div>
          <div className="receipt-totals-row receipt-totals-total">
            <span>Total paid</span>
            <strong>{money(receipt.totalPaid)}</strong>
          </div>
        </div>

        <div className="receipt-invoice-hash">
          <span className="stat-label">Stellar transaction hash</span>
          <code className="receipt-invoice-mono">{receipt.stellarTxHash}</code>
        </div>

        <div className="form-actions no-print">
          <Button variant="ghost" type="button" onClick={onClose}>
            Close
          </Button>
          <Button variant="primary" type="button" onClick={handleDownloadPdf}>
            Download PDF
          </Button>
        </div>
      </div>
    </div>
  );
}
