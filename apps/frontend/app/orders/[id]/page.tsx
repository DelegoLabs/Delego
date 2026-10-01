"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Button, Card } from "@delegolabs/ui";
import { useOrders } from "../../../hooks/useOrders";
import { useNetwork } from "../../../hooks/useNetwork";
import dynamic from "next/dynamic";
import { ReceiptPanel } from "../../../components/orders/ReceiptPanel";
import { TaxBreakdownPanel } from "../../../components/orders/TaxBreakdownPanel";
import { computeTaxBreakdown } from "../../../lib/taxBreakdown";
import { receiptFeeStroops, receiptSubtotalStroops } from "../../../lib/receipts";
import { getConfiguredContracts } from "../../../lib/contracts";

const OnChainVerificationPanel = dynamic(
  () =>
    import("../../../components/escrows/OnChainVerificationPanel").then(
      (m) => m.OnChainVerificationPanel
    ),
  { ssr: false }
);

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

  const fee = receiptFeeStroops(order);
  const tax = computeTaxBreakdown({
    subtotalStroops: receiptSubtotalStroops(order),
    networkFeeStroops: fee,
    category: (order as { category?: string | null }).category,
  });

  return (
    <div className="settings-page">
      <div className="no-print">
        {/* Single, low-cost link — viewport prefetch is fine (#621). */}
        <Link href="/orders" prefetch={true} className="receipt-back-link">
          ← Back to Transaction History
        </Link>
      </div>

      {/* Pre-approval view: expanded so the tax estimate is visible up front (#723). */}
      <div className="no-print">
        <Card title="Order summary">
          <TaxBreakdownPanel
            breakdown={tax}
            networkFeeStroops={fee.toString()}
            defaultExpanded
            variant="checkout"
          />
        </Card>
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
