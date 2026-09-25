"use client";

import { useEffect, useState } from "react";
import { useNetwork } from "./useNetwork";

/** Status of the active Soroban RPC endpoint, as surfaced in the header. */
export interface SorobanHealthStatus {
  status: "healthy" | "degraded" | "down";
  latestLedger: number;
  latencyMs: number;
  networkPassphrase: string;
}

const POLL_INTERVAL_MS = 30_000;
/** Above this latency (or on any RPC error), the indicator turns amber/red. */
const DEGRADED_LATENCY_MS = 2000;

async function fetchHealth(rpcUrl: string, networkPassphrase: string): Promise<SorobanHealthStatus> {
  const start = performance.now();
  try {
    const res = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getHealth" }),
      signal: AbortSignal.timeout(5000),
    });
    const latencyMs = Math.round(performance.now() - start);
    const json = (await res.json()) as {
      result?: { status?: string; latestLedger?: number };
      error?: unknown;
    };
    if (!res.ok || json.error || json.result?.status !== "healthy") {
      return {
        status: "down",
        latestLedger: json.result?.latestLedger ?? 0,
        latencyMs,
        networkPassphrase,
      };
    }
    return {
      status: latencyMs > DEGRADED_LATENCY_MS ? "degraded" : "healthy",
      latestLedger: json.result.latestLedger ?? 0,
      latencyMs,
      networkPassphrase,
    };
  } catch {
    return {
      status: "down",
      latestLedger: 0,
      latencyMs: Math.round(performance.now() - start),
      networkPassphrase,
    };
  }
}

/**
 * Polls the active network's Soroban RPC endpoint every 30 seconds and
 * reports its health (latest ledger, latency, healthy/degraded/down).
 */
export function useSorobanHealth(): SorobanHealthStatus | null {
  const { network } = useNetwork();
  const [status, setStatus] = useState<SorobanHealthStatus | null>(null);
  const rpcUrl = network.sorobanRpcUrl;
  const networkPassphrase = network.networkPassphrase;

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      const result = await fetchHealth(rpcUrl, networkPassphrase);
      if (!cancelled) setStatus(result);
    };
    void poll();
    const timer = setInterval(() => void poll(), POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [rpcUrl, networkPassphrase]);

  return status;
}
