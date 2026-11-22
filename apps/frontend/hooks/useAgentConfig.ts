"use client";

import useSWR from "swr";
import type { AgentPersonaConfig } from "../lib/agentConfig";

const fetcher = (url: string) =>
  fetch(url, { credentials: "include" }).then((res) => {
    if (!res.ok) {
      const error = new Error("Failed to fetch agent config");
      (error as any).status = res.status;
      throw error;
    }
    return res.json();
  });

const DEFAULT_CONFIG: AgentPersonaConfig = {
  agentId: "",
  name: "Shopping Agent",
  strategy: "balanced",
  maxAutonomousBudgetStroops: "0",
  negotiationAllowed: true,
  preferredAsset: "USDC",
  persona: "balanced",
};

export interface UseAgentConfigResult {
  config: AgentPersonaConfig;
  isLoading: boolean;
  error: Error | null;
  mutate: () => void;
  isValidating: boolean;
}

/**
 * Fetches the user's persisted agent strategy and budget configuration.
 * Falls back to defaults if the API is unavailable or returns an error.
 */
export function useAgentConfig(): UseAgentConfigResult {
  const {
    data,
    error,
    isLoading,
    isValidating,
    mutate,
  } = useSWR<AgentPersonaConfig>(
    "/api/agent/config",
    fetcher,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      dedupingInterval: 60_000,
      fallbackData: DEFAULT_CONFIG,
    }
  );

  return {
    config: data ?? DEFAULT_CONFIG,
    isLoading,
    error: error ?? null,
    mutate,
    isValidating,
  };
}