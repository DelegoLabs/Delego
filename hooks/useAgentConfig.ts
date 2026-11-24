import useSWR from "swr";

export interface AgentConfig {
  id: string;
  name: string;
  description?: string;
  [key: string]: unknown;
}

const fetcher = async (url: string): Promise<AgentConfig> => {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch agent config: ${res.status}`);
  }
  return res.json() as Promise<AgentConfig>;
};

export function useAgentConfig(agentId: string | null | undefined) {
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

export default useAgentConfig;
