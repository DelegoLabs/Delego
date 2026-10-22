export interface RpcEndpointHealth {
  url: string;
  latencyMs: number;
  isAvailable: boolean;
  latestLedgerSequence: number;
}

export type NetworkType = "futurenet" | "testnet" | "mainnet";

export const NETWORK_RPC_ENDPOINTS: Record<string, string[]> = {
  futurenet: [
    "https://rpc-futurenet.stellar.org",
    "https://futurenet.sorobanrpc.com",
  ],
  testnet: [
    "https://soroban-testnet.stellar.org",
    "https://rpc-testnet.stellar.org",
    "https://testnet.sorobanrpc.com",
  ],
  mainnet: [
    "https://mainnet.sorobanrpc.com",
    "https://soroban-rpc.mainnet.stellar.org",
    "https://rpc.stellar.org",
  ],
};

import { useEffect, useState, useRef, useCallback } from "react";

export function classifyLatency(latencyMs: number, isAvailable: boolean): "green" | "yellow" | "red" {
  if (!isAvailable) return "red";
  if (latencyMs < 200) return "green";
  if (latencyMs <= 800) return "yellow";
  return "red";
}

export async function probeEndpoint(
  url: string,
  timeoutMs: number = 5000
): Promise<RpcEndpointHealth> {
  const start = performance.now();
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getLatestLedger",
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const elapsed = Math.round(performance.now() - start);

    if (!res.ok) {
      return {
        url,
        latencyMs: elapsed,
        isAvailable: false,
        latestLedgerSequence: 0,
      };
    }

    const data = (await res.json()) as {
      result?: { sequence?: number };
      error?: unknown;
    };

    if (
      data.error ||
      !data.result ||
      typeof data.result.sequence !== "number"
    ) {
      return {
        url,
        latencyMs: elapsed,
        isAvailable: false,
        latestLedgerSequence: 0,
      };
    }

    return {
      url,
      latencyMs: elapsed,
      isAvailable: true,
      latestLedgerSequence: data.result.sequence,
    };
  } catch {
    const elapsed = Math.round(performance.now() - start);
    return {
      url,
      latencyMs: elapsed,
      isAvailable: false,
      latestLedgerSequence: 0,
    };
  }
}

export function selectBestEndpoint(
  endpoints: RpcEndpointHealth[]
): RpcEndpointHealth | null {
  const healthy = endpoints.filter((e) => e.isAvailable);
  if (healthy.length === 0) return null;

  healthy.sort((a, b) => a.latencyMs - b.latencyMs);
  return healthy[0];
}

export interface UseRpcLatencyProberResult {
  endpointsHealth: RpcEndpointHealth[];
  activeEndpoint: RpcEndpointHealth | null;
  activeUrl: string | null;
  statusColor: "green" | "yellow" | "red";
  probeAll: () => Promise<void>;
}

export function useRpcLatencyProber(
  network: string,
  customEndpoints?: string[]
): UseRpcLatencyProberResult {
  const [endpointsHealth, setEndpointsHealth] = useState<RpcEndpointHealth[]>([]);
  const [activeEndpoint, setActiveEndpoint] = useState<RpcEndpointHealth | null>(null);
  const isProbingRef = useRef(false);

  const targetUrls = customEndpoints ?? NETWORK_RPC_ENDPOINTS[network.toLowerCase()] ?? [
    "https://soroban-testnet.stellar.org",
  ];

  const probeAll = useCallback(async () => {
    if (isProbingRef.current) return;
    isProbingRef.current = true;

    try {
      const results = await Promise.all(
        targetUrls.map((url) => probeEndpoint(url))
      );
      setEndpointsHealth(results);
      const best = selectBestEndpoint(results);
      setActiveEndpoint(best);
    } finally {
      isProbingRef.current = false;
    }
  }, [targetUrls.join(",")]);

  useEffect(() => {
    let unmounted = false;

    const runProbe = async () => {
      if (unmounted) return;
      await probeAll();
    };

    void runProbe();
    const timer = setInterval(() => {
      void runProbe();
    }, 30_000);

    return () => {
      unmounted = true;
      clearInterval(timer);
    };
  }, [probeAll]);

  const statusColor = activeEndpoint
    ? classifyLatency(activeEndpoint.latencyMs, activeEndpoint.isAvailable)
    : "red";

  return {
    endpointsHealth,
    activeEndpoint,
    activeUrl: activeEndpoint ? activeEndpoint.url : targetUrls[0] || null,
    statusColor,
    probeAll,
  };
}
