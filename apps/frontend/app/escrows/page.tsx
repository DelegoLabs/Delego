"use client";

import { useMemo } from "react";
import type { Escrow } from "@delegolabs/types";
import { useEscrows } from "../../hooks/useEscrows";
import { useQueryParamState } from "../../hooks/useQueryParamState";
import { EscrowCard } from "../../components/escrows/EscrowCard";
import { EscrowFilters } from "../../components/escrows/EscrowFilters";
import { CopyViewLinkButton } from "../../components/filters/CopyViewLinkButton";
import { Button } from "@delegolabs/ui";

type EscrowStatus = Escrow["status"];

export default function EscrowsPage() {
  const { escrows, loading, error } = useEscrows();
  const [search, setSearch] = useQueryParamState<string>({
    key: "q",
    defaultValue: "",
  });
  const [selectedStatuses, setSelectedStatuses] = useQueryParamState<EscrowStatus[]>({
    key: "status",
    defaultValue: [],
  });

  const visibleEscrows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return escrows.filter((escrow) => {
      const matchesSearch =
        term === "" ||
        escrow.escrowId.toLowerCase().includes(term) ||
        escrow.orderId.toLowerCase().includes(term) ||
        escrow.buyer.toLowerCase().includes(term) ||
        escrow.seller.toLowerCase().includes(term);
      const matchesStatus =
        selectedStatuses.length === 0 || selectedStatuses.includes(escrow.status);
      return matchesSearch && matchesStatus;
    });
  }, [escrows, search, selectedStatuses]);

  const toggleStatus = (status: EscrowStatus) => {
    setSelectedStatuses(
      selectedStatuses.includes(status)
        ? selectedStatuses.filter((s) => s !== status)
        : [...selectedStatuses, status]
    );
  };

  return (
    <main className="container">
      <header className="header">
        <div className="header-row">
          <div>
            <h1>Escrows</h1>
            <p>
              Track your active escrow agreements and monitor fund status on-chain.
            </p>
          </div>
          <CopyViewLinkButton />
        </div>
      </header>

      {escrows.length > 0 && (
        <EscrowFilters
          search={search}
          onSearchChange={setSearch}
          selectedStatuses={selectedStatuses}
          onToggleStatus={toggleStatus}
        />
      )}

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
            Try again
          </Button>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && visibleEscrows.length === 0 && (
        <div
          style={{
            textAlign: "center",
            padding: "3rem 1rem",
          }}
        >
          <p style={{ margin: "0 0 0.5rem", fontWeight: 500, color: "#374151" }}>
            {escrows.length === 0 ? "No active escrows" : "No escrows match the current filters"}
          </p>
          <p style={{ margin: 0, fontSize: "0.875rem", color: "#6b7280" }}>
            {escrows.length === 0
              ? "Escrow agreements will appear here once your agents initiate purchases on your behalf."
              : "Try adjusting your search or status filters."}
          </p>
        </div>
      )}

      {/* Escrow list */}
      {!loading && !error && visibleEscrows.length > 0 && (
        <section className="grid" aria-label="Escrow list">
          {visibleEscrows.map((escrow) => (
            <EscrowCard key={escrow.escrowId} escrow={escrow} href={`/escrows/${escrow.escrowId}`} />
          ))}
        </section>
      )}
    </main>
  );
}
