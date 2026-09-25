import { env } from "./env";
import { createRetryingFetch } from "./api";

export type OptimizationStrategy = "lowest_price" | "highest_rating" | "fastest_delivery" | "balanced";

export interface AgentPersonaConfig {
  agentId: string;
  name: string;
  strategy: OptimizationStrategy;
  maxAutonomousBudgetStroops: string;
  negotiationAllowed: boolean;
  preferredAsset: "USDC" | "XLM" | "EURC";
}

export const STRATEGY_OPTIONS: { value: OptimizationStrategy; label: string; description: string }[] = [
  { value: "lowest_price", label: "Lowest price", description: "Always prioritize the cheapest option." },
  { value: "highest_rating", label: "Highest rating", description: "Prefer the best-reviewed merchants." },
  { value: "fastest_delivery", label: "Fastest delivery", description: "Optimize for speed over cost." },
  { value: "balanced", label: "Balanced", description: "Weigh price, rating, and delivery time evenly." },
];

const retryingFetch = createRetryingFetch();

/**
 * Persists an agent's persona/autonomy config via `PUT /api/agent/config`.
 * There is no method for this on `@delegolabs/sdk` yet (see `submitShipment`
 * in `lib/shipments.ts` for the same direct-REST-call pattern and its auth
 * caveat).
 */
export async function saveAgentConfig(config: AgentPersonaConfig): Promise<void> {
  const res = await retryingFetch(`${env.NEXT_PUBLIC_API_URL}/api/agent/config`, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.message ?? `Failed to save agent settings (${res.status}).`);
  }
}
