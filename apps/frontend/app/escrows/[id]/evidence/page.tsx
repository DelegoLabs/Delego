import { DisputeEvidenceComparison } from "../../../../components/escrows/DisputeEvidenceComparison";
import type { DisputeEvidenceBundle } from "../../../../types/dispute-evidence";

/**
 * Dispute evidence comparison page showing side-by-side buyer claims
 * and merchant counter-proofs with fullscreen image inspection.
 * 
 * This is a demo implementation showing 2% of the feature.
 */
export default function DisputeEvidencePage({ params }: { params: { id: string } }) {
  // Mock data for demonstration - in production, this would be fetched from the API
  const mockEvidence: DisputeEvidenceBundle = {
    disputeId: params.id,
    buyerStatement: "I ordered a brand new laptop but received a damaged one with a cracked screen. The package appeared to have been dropped during shipping. The device powers on but the screen is completely unusable.",
    buyerImages: [
      "https://images.unsplash.com/photo-1588872657578-7efd1f1555ed?w=800&q=80",
      "https://images.unsplash.com/photo-1593642702821-c8da6771f0c6?w=800&q=80",
      "https://images.unsplash.com/photo-1603302576837-37561b2e2302?w=800&q=80",
    ],
    merchantStatement: "The laptop was thoroughly inspected and tested before shipping. All items are packed with protective bubble wrap and foam. Our shipping partner provided tracking showing the package was delivered intact. We have photos from our quality control process showing the device in perfect condition before shipment.",
    merchantImages: [
      "https://images.unsplash.com/photo-1484788984921-03950022c9ef?w=800&q=80",
      "https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=800&q=80",
    ],
    status: "under_review",
  };

  // Resolution deadline set to 3 days from now
  const resolutionDeadline = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();

  const handleRequestMoreEvidence = () => {
    console.log("Requesting more evidence from merchant");
    // In production, this would trigger an API call to request additional evidence
  };

  return (
    <main style={{ padding: "2rem", maxWidth: "1400px", margin: "0 auto" }}>
      <DisputeEvidenceComparison
        evidence={mockEvidence}
        resolutionDeadline={resolutionDeadline}
        onRequestMoreEvidence={handleRequestMoreEvidence}
      />
    </main>
  );
}
