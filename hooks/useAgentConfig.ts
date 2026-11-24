import useSWR from 'swr';

export interface AgentConfig {
  id: string;
  name: string;
  model: string;
  temperature: number;
  maxTokens: number;
  systemPrompt: string;
  enabled: boolean;
}

export interface UseAgentConfigOptions {
  agentId?: string;
  endpoint?: string;
  refreshInterval?: number;
}

const DEFAULT_ENDPOINT = '/api/agents';

const fetchAgentConfig = async (url: string): Promise<AgentConfig> => {
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    credentials: 'include',
  });

  if (!res.ok) {
    const error = new Error(`Failed to load agent config (${res.status})`);
    (error as Error & { status?: number }).status = res.status;
    throw error;
  }

  return (await res.json()) as AgentConfig;
};

export function useAgentConfig(options: UseAgentConfigOptions = {}) {
  const { agentId, endpoint = DEFAULT_ENDPOINT, refreshInterval = 0 } = options;

  const key = agentId ? `${endpoint}/${encodeURIComponent(agentId)}` : null;

  const { data, error, isLoading, isValidating, mutate } = useSWR<AgentConfig>(
    key,
    fetchAgentConfig,
    {
      refreshInterval,
      revalidateOnFocus: false,
    },
  );

  return {
    config: data,
    error,
    isLoading,
    isValidating,
    refresh: () => mutate(),
  };
}

export default useAgentConfig;
