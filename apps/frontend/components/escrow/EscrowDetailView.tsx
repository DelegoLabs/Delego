"use client";

import { useState } from "react";
import { Card } from "@delego/ui";
import { useEscrowDetail } from "../../hooks/useEscrowDetail";
import { useInvalidateReleaseEligibility, useReleaseEligibility } from "../../hooks/useReleaseEligibility";
import { FeeBreakdown } from "./FeeBreakdown";
import { ReleaseCta } from "./ReleaseCta";

export function EscrowDetailView({ escrowId }: { escrowId: string }) {
  const { data: escrow, isLoading: escrowLoading, error: escrowError } = useEscrowDetail(escrowId);
  const caller = escrow?.buyer;
  const { data: eligibility, isLoading: eligibilityLoading } = useReleaseEligibility(escrowId, caller);
  const invalidateEligibility = useInvalidateReleaseEligibility(escrowId, caller);
  const [releaseNote, setReleaseNote] = useState<string | null>(null);

  if (escrowLoading) {
    return (
      <main className="container">
        <p>Loading escrow...</p>
      </main>
    );
  }

  if (escrowError || !escrow) {
    return (
      <main className="container">
        <p>Escrow not found.</p>
      </main>
    );
  }

  async function handleRelease() {
    // Signing and submitting the release transaction requires a connected wallet, which this
    // app doesn't wire up yet (see the homepage's "Connect Wallet" placeholder). Refresh
    // eligibility so the CTA reflects the current on-chain state rather than silently no-oping.
    setReleaseNote("Release requires a connected wallet to sign and submit — not yet wired up.");
    await invalidateEligibility();
  }

  return (
    <main className="container">
      <header className="header">
        <h1>Escrow {escrow.escrowId}</h1>
        <p>Status: {escrow.status}</p>
      </header>

      <section style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
        <Card title="Fees">
          <FeeBreakdown fees={escrow.fees} />
        </Card>

        <Card title="Release">
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", alignItems: "flex-start" }}>
            <ReleaseCta eligibility={eligibility} isLoading={eligibilityLoading} onRelease={handleRelease} />
            {releaseNote && (
              <p style={{ margin: 0, color: "var(--color-text-muted)", fontSize: "0.875rem" }}>{releaseNote}</p>
            )}
          </div>
        </Card>
      </section>
    </main>
  );
}
