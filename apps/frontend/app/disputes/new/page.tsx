import { DisputeNewForm } from "../../../components/disputes/DisputeNewForm";

interface DisputeNewPageProps {
  searchParams: Promise<{
    orderId?: string;
    issueId?: string;
    category?: string;
    message?: string;
  }>;
}

export default async function DisputeNewPage({ searchParams }: DisputeNewPageProps) {
  const params = await searchParams;
  return (
    <DisputeNewForm
      orderId={params.orderId ?? ""}
      issueId={params.issueId}
      initialCategory={params.category}
      initialMessage={params.message}
    />
  );
}
