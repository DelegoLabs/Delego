"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Button, Card } from "@delegolabs/ui";
import { useOrders } from "../../../hooks/useOrders";
import { useNetwork } from "../../../hooks/useNetwork";
import { ReceiptPanel } from "../../../components/orders/ReceiptPanel";
import { OnChainVerificationPanel } from "../../../components/escrows/OnChainVerificationPanel";
import { getConfiguredContracts } from "../../../lib/contracts";

/** Order detail page — buyer-facing receipt for a single order (proof of purchase). */
export default function OrderDetailPage() {
  const params = useParams();
  const orderId = (params?.id as string) ?? "";
  const { orders, loading } = useOrders();
  const order = orders.find((o) => o.id === orderId);
  const { networkId } = useNetwork();

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
          <Link href="/orders" prefetch={true}>
            <Button variant="primary">← Back to Transaction History</Button>
          </Link>
        </Card>
      </div>
    );
  }

  const permissionsContract = getConfiguredContracts(networkId).find(
    (c) => c.name === "permissions"
  );

  return (
    <div className="settings-page">
      <div className="no-print">
        {/* Single, low-cost link — viewport prefetch is fine (#621). */}
        <Link href="/orders" prefetch={true} className="receipt-back-link">
          ← Back to Transaction History
        </Link>
      </div>
      <ReceiptPanel order={order} />

      <div className="no-print">
        <OnChainVerificationPanel
          kind="permission"
          receiptKey={order.delegationId}
          contractAddress={
            permissionsContract?.addressValid
              ? (permissionsContract.address as string)
              : null
          }
          localData={{
            amount: String(order.totalStroops ?? order.amount ?? ""),
            merchantId: order.merchantId ?? "",
          }}
          compareFields={["amount", "merchantId"]}
          fieldLabels={{ amount: "Amount", merchantId: "Merchant" }}
        />
      </div>
    </div>
  );
}
