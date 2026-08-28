import { OrderDetailView } from "../../../components/orders/OrderDetailView";

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <OrderDetailView orderId={id} />;
}
