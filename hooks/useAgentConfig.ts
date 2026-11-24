import useSWR from "swr";

export interface AgentConfig {
  id: string;
  name: string;
  [key: string]: unknown;
}

const fetcher = async (url: string): Promise<AgentConfig> => {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`Failed to fetch agent config: ${res.status}`);
  }
  return res.json() as Promise<AgentConfig>;
};

export function useAgentConfig(agentId?: string) {
  const { data, error, isLoading, mutate } = useSWR<AgentConfig>(
    agentId ? `/api/agents/${encodeURIComponent(agentId)}/config` : null,
    fetcher,
  );

  return {
    config: data,
    error,
    isLoading,
    refresh: mutate,
  };
}
