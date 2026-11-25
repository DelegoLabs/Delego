import useSWR from "swr";

export interface AgentConfig {
  id: string;
  name: string;
  description?: string;
  model?: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  tools?: string[];
  enabled?: boolean;
  [key: string]: unknown;
}

const fetcher = async (url: string): Promise<AgentConfig> => {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) {
    throw new Error(`Failed to load agent config (${res.status})`);
  }
  return res.json() as Promise<AgentConfig>;
};

export function useAgentConfig(agentId?: string) {
  const { data, error, isLoading, isValidating, mutate } = useSWR<AgentConfig>(
    agentId ? `/api/agents/${encodeURIComponent(agentId)}/config` : null,
    fetcher,
  );

  return {
    config: data,
    error,
    isLoading,
    isValidating,
    mutate,
  };
}

export default useAgentConfig;
