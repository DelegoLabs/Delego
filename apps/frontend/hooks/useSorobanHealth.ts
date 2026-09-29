"use client";

import { useEffect, useState } from "react";
import { useNetwork } from "./useNetwork";

/** Status of the active Soroban RPC endpoint, as surfaced in the header. */
export interface NetworkHealthState {
  network: "mainnet" | "testnet";
  rpcLatencyMs: number;
  latestLedger: number;
  status: "optimal" | "degraded" | "down";
}

const POLL_INTERVAL_MS = 30_000;
const DEGRADED_LATENCY_MS_LOWER = 200;
const DEGRADED_LATENCY_MS_UPPER = 800;

async function fetchHealth(rpcUrl: string, networkId: "mainnet" | "testnet"): Promise<NetworkHealthState> {
  const start = performance.now();
  try {
    const res = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getLatestLedger" }),
      signal: AbortSignal.timeout(5000),
    });
    const rpcLatencyMs = Math.round(performance.now() - start);
    const json = (await res.json()) as {
      result?: { id?: string; protocolVersion?: number; sequence?: number };
      error?: unknown;
    };
    
    if (!res.ok || json.error || !json.result || typeof json.result.sequence !== "number") {
      return {
        network: networkId,
        status: "down",
        latestLedger: 0,
        rpcLatencyMs,
      };
    }
    
    const latestLedger = json.result.sequence;
    let status: "optimal" | "degraded" | "down" = "optimal";
    
    if (rpcLatencyMs >= DEGRADED_LATENCY_MS_UPPER) {
      status = "down"; // Wait, "Red > 800ms" should mean degraded/down? The issue says: Green < 200ms, Amber 200-800ms, Red > 800ms. And status: "optimal" | "degraded" | "down".
    } else if (rpcLatencyMs >= DEGRADED_LATENCY_MS_LOWER) {
      status = "degraded";
    }
    
    return {
      network: networkId,
      status: rpcLatencyMs >= DEGRADED_LATENCY_MS_UPPER ? "down" : rpcLatencyMs >= DEGRADED_LATENCY_MS_LOWER ? "degraded" : "optimal",
      latestLedger,
      rpcLatencyMs,
    };
  } catch {
    return {
      network: networkId,
      status: "down",
      latestLedger: 0,
      rpcLatencyMs: Math.round(performance.now() - start),
    };
  }
}

/**
 * Polls the active network's Soroban RPC endpoint every 30 seconds and
 * reports its health (latest ledger, latency, optimal/degraded/down).
 */
export function useSorobanHealth(): NetworkHealthState | null {
  const { networkId, network } = useNetwork();
  const [state, setState] = useState<NetworkHealthState | null>(null);
  const rpcUrl = network.sorobanRpcUrl;

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      const result = await fetchHealth(rpcUrl, networkId as "mainnet" | "testnet");
      if (!cancelled) setState(result);
    };
    void poll();
    const timer = setInterval(() => void poll(), POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [rpcUrl, networkId]);

  return state;
}
