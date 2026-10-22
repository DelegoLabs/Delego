"use client";

import { useState } from "react";
import { useRpcLatencyProber } from "../../hooks/useRpcLatencyProber";
import { useNetwork } from "../../hooks/useNetwork";

const STATUS_COLOR: Record<"green" | "yellow" | "red", string> = {
  green: "#16a34a",
  yellow: "#f59e0b",
  red: "#dc2626",
};

/**
 * Small status dot (footer/header) showing Soroban RPC health for the
 * active network — green (<200ms), yellow (200-800ms), red (>800ms / unavailable),
 * with a native tooltip giving the latest ledger sequence and ping time.
 * Automatically selects the fastest healthy endpoint. Clicking opens a details modal.
 */
export function SorobanHealthIndicator() {
  const { networkId, network } = useNetwork();
  const prober = useRpcLatencyProber(networkId, [network.sorobanRpcUrl]);
  const [modalOpen, setModalOpen] = useState(false);

  const active = prober.activeEndpoint;
  const statusColor = prober.statusColor;

  if (!active) {
    return (
      <span
        role="img"
        aria-label="Soroban RPC status: checking"
        title="Checking Soroban RPC status…"
        style={{
          display: "inline-block",
          width: 8,
          height: 8,
          borderRadius: "9999px",
          background: "#9ca3af",
        }}
      />
    );
  }

  const color = STATUS_COLOR[statusColor];
  const tooltip = !active.isAvailable
    ? "Soroban RPC unreachable"
    : `Ledger ${active.latestLedgerSequence.toLocaleString()} · ${active.latencyMs}ms`;

  return (
    <>
      <button
        type="button"
        onClick={() => setModalOpen(true)}
        aria-label={`Soroban RPC status: ${statusColor}`}
        title={tooltip}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          fontSize: "0.75rem",
          color: "#6b7280",
          cursor: "pointer",
          background: "none",
          border: "none",
          padding: 4,
        }}
      >
        <span
          style={{
            display: "inline-block",
            width: 8,
            height: 8,
            borderRadius: "9999px",
            background: color,
          }}
        />
      </button>

      {modalOpen && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 50,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "rgba(0, 0, 0, 0.5)",
          }}
          onClick={() => setModalOpen(false)}
        >
          <div
            style={{
              backgroundColor: "#fff",
              color: "#000",
              padding: "24px",
              borderRadius: "8px",
              boxShadow: "0 4px 6px rgba(0, 0, 0, 0.1)",
              maxWidth: "400px",
              width: "100%",
              margin: "16px",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ marginTop: 0, marginBottom: "16px", fontSize: "1.25rem", fontWeight: 600 }}>
              Soroban RPC Network Health
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px", fontSize: "0.875rem" }}>
              <div>
                <strong style={{ color: "#374151" }}>Network:</strong> {networkId}
              </div>
              <div>
                <strong style={{ color: "#374151" }}>Active Endpoint:</strong> {active.url}
              </div>
              <div>
                <strong style={{ color: "#374151" }}>Status:</strong>{" "}
                <span style={{ color, fontWeight: 600, textTransform: "capitalize" }}>{statusColor}</span>
              </div>
              <div>
                <strong style={{ color: "#374151" }}>Latency:</strong> {active.latencyMs}ms
              </div>
              <div>
                <strong style={{ color: "#374151" }}>Latest Ledger:</strong> {active.latestLedgerSequence.toLocaleString()}
              </div>
            </div>
            <button
              style={{
                marginTop: "24px",
                width: "100%",
                padding: "8px 16px",
                backgroundColor: "#f3f4f6",
                color: "#1f2937",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer",
                fontWeight: 500,
              }}
              onClick={() => setModalOpen(false)}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
}
