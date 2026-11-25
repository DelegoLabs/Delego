import { DisputeEvidenceClient } from "./DisputeEvidenceClient";

/**
 * Dispute evidence comparison page showing side-by-side buyer claims
 * and merchant counter-proofs with fullscreen image inspection.
 */
export default async function DisputeEvidencePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <main style={{ padding: "2rem", maxWidth: "1400px", margin: "0 auto" }}>
      <DisputeEvidenceClient escrowId={id} />
    </main>
  );
}
