"use client";

import { useEscrows } from "../../hooks/useEscrows";
import { EscrowCard } from "../../components/escrows/EscrowCard";
import { Button } from "@delego/ui";

export default function EscrowsPage() {
  const { escrows, loading, error } = useEscrows();

  return (
    <main className="container">
      <header className="header">
        <h1>Escrows</h1>
        <p>
          Track your active escrow agreements and monitor fund status on-chain.
        </p>
      </header>

      {/* Loading skeleton */}
      {loading && (
        <section
          className="grid"
          aria-busy="true"
          aria-label="Loading escrows"
        >
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              style={{
                border: "1px solid #e5e7eb",
                borderRadius: "0.5rem",
                padding: "1rem",
                background: "#fff",
                minHeight: "10rem",
                animation: "pulse 1.5s ease-in-out infinite",
              }}
            />
          ))}
        </section>
      )}

      {/* Error state */}
      {!loading && error && (
        <div
          style={{
            textAlign: "center",
            padding: "3rem 1rem",
            color: "#991b1b",
          }}
        >
          <p style={{ margin: "0 0 1rem", fontWeight: 500 }}>
            Unable to load escrows
          </p>
          <p style={{ margin: "0 0 1.5rem", fontSize: "0.875rem", color: "#6b7280" }}>
            {error}
          </p>
          <Button
            variant="secondary"
            onClick={() => window.location.reload()}
          >
            Retry
          </Button>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && escrows.length === 0 && (
        <div
          style={{
            textAlign: "center",
            padding: "3rem 1rem",
          }}
        >
          <p style={{ margin: "0 0 0.5rem", fontWeight: 500, color: "#374151" }}>
            No active escrows
          </p>
          <p style={{ margin: 0, fontSize: "0.875rem", color: "#6b7280" }}>
            Escrow agreements will appear here once your agents initiate
            purchases on your behalf.
          </p>
        </div>
      )}

      {/* Escrow list */}
      {!loading && !error && escrows.length > 0 && (
        <section className="grid" aria-label="Escrow list">
          {escrows.map((escrow) => (
            <EscrowCard key={escrow.escrowId} escrow={escrow} />
          ))}
        </section>
      )}
    </main>
  );
}
