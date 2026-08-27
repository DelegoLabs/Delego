"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Button, Card } from "@delegolabs/ui";
import { useOrders } from "../../../hooks/useOrders";
import { ReceiptPanel } from "../../../components/orders/ReceiptPanel";

/** Order detail page — buyer-facing receipt for a single order (proof of purchase). */
export default function OrderDetailPage() {
  const params = useParams();
  const orderId = (params?.id as string) ?? "";
  const { orders, loading } = useOrders();
  const order = orders.find((o) => o.id === orderId);

  if (loading && orders.length === 0) {
    return (
      <div className="settings-page">
        <div className="card skeleton">
          <div className="skeleton-title" />
          <div className="skeleton-text" />
          <div className="skeleton-text" />
          <div className="skeleton-text" />
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="settings-page">
        <Card title="Order not found" ariaLabel="Order not found">
          <p>
            No order could be found with ID <code>{orderId}</code>.
          </p>
          <Link href="/orders">
            <Button variant="primary">← Back to Transaction History</Button>
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="settings-page">
      <div className="no-print">
        <Link href="/orders" className="receipt-back-link">
          ← Back to Transaction History
        </Link>
      </div>
      <ReceiptPanel order={order} />
    </div>
  );
}
