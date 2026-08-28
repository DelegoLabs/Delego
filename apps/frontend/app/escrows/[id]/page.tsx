import { EscrowDetailView } from "../../../components/escrow/EscrowDetailView";

export default async function EscrowDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <EscrowDetailView escrowId={id} />;
}
