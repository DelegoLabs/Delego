"use client";

import { useState } from "react";
import { Button } from "@delegolabs/ui";
import type { Order } from "@delegolabs/types";
import {
  generateInvoicePdf,
  type InvoiceData,
} from "../../lib/invoiceGenerator";

export interface DownloadInvoiceButtonProps {
  order: Order;
  /** Stellar network the escrow lives on — determines the explorer URL in the QR code. */
  network?: "mainnet" | "testnet";
  /** Optional label override; defaults to "Download Invoice". */
  label?: string;
  /** Button variant forwarded to the underlying Button component. */
  variant?: "primary" | "secondary" | "ghost";
  className?: string;
}

/**
 * Renders a "Download Invoice" button that is only active for settled orders.
 *
 * On click it assembles an InvoiceData payload from the Order model and calls
 * generateInvoicePdf(), which builds the PDF client-side and triggers a
 * browser download — no server round-trip needed.
 */
export function DownloadInvoiceButton({
  order,
  network = "testnet",
  label = "Download Invoice",
  variant = "secondary",
  className,
}: DownloadInvoiceButtonProps) {
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSettled = order.status === "settled";

  if (!isSettled) return null;

  async function handleClick() {
    if (generating) return;
    setError(null);
    setGenerating(true);

    try {
      const invoiceData: InvoiceData = {
        orderId: order.id,
        escrowId: (order as { escrowContractId?: string }).escrowContractId ?? order.id,
        buyerAddress: (order as { userId?: string }).userId ?? "—",
        merchantName: order.merchantId ?? "—",
        items: (order.lineItems ?? []).map((item) => ({
          name: item.productId ?? "Item",
          quantity: item.quantity,
          unitPriceStroops: BigInt(item.unitPriceStroops ?? 0),
        })),
        totalAmountStroops: BigInt(order.totalStroops ?? 0),
        // taxAmountStroops: not stored in Order — use 0; real apps would fetch this.
        taxAmountStroops: 0n,
        settledAt: order.updatedAt ? new Date(order.updatedAt) : new Date(),
        stellarTxHash:
          (order as { stellarTxHash?: string }).stellarTxHash ?? undefined,
      };

      await generateInvoicePdf(invoiceData, network);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to generate invoice."
      );
    } finally {
      setGenerating(false);
    }
  }

  return (
    <span className={className}>
      <Button
        variant={variant}
        type="button"
        onClick={handleClick}
        aria-label={`Download PDF invoice for order ${order.id}`}
        aria-busy={generating}
        aria-disabled={generating}
      >
        {generating ? "Generating…" : label}
      </Button>
      {error && (
        <span role="alert" className="invoice-download-error stat-label">
          {error}
        </span>
      )}
    </span>
  );
}
