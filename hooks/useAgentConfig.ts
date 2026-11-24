import useSWR from "swr";

export interface AgentConfig {
  id: string;
  name: string;
  description?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
  enabled?: boolean;
  [key: string]: unknown;
}

export interface UseAgentConfigResult {
  config: AgentConfig | undefined;
  error: Error | undefined;
  isLoading: boolean;
  isValidating: boolean;
  mutate: () => Promise<AgentConfig | undefined>;
}

const fetcher = async (url: string): Promise<AgentConfig> => {
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch agent config: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as AgentConfig;
};

export function useAgentConfig(agentId: string | null | undefined): UseAgentConfigResult {
  const key = agentId ? `/api/agents/${encodeURIComponent(agentId)}/config` : null;

  const { data, error, isLoading, isValidating, mutate } = useSWR<AgentConfig, Error>(
    key,
    fetcher,
  );

  return {
    config: data,
    error,
    isLoading,
    isValidating,
    mutate: () => mutate(),
  };
}

export default useAgentConfig;
