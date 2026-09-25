"use client";

import { useSorobanHealth } from "../../hooks/useSorobanHealth";

const STATUS_COLOR: Record<string, string> = {
  healthy: "#16a34a",
  degraded: "#f59e0b",
  down: "#dc2626",
};

/**
 * Small status dot (footer/header) showing Soroban RPC health for the
 * active network — green/amber/red, with a native tooltip giving the
 * latest ledger sequence and ping time.
 */
export function SorobanHealthIndicator() {
  const health = useSorobanHealth();

  if (!health) {
    return (
      <span
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

  const color = STATUS_COLOR[health.status];
  const tooltip =
    health.status === "down"
      ? "Soroban RPC unreachable"
      : `Ledger ${health.latestLedger.toLocaleString()} · ${health.latencyMs}ms`;

  return (
    <span
      role="status"
      aria-label={`Soroban RPC status: ${health.status}`}
      title={tooltip}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontSize: "0.75rem",
        color: "#6b7280",
        cursor: "default",
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
    </span>
  );
}
