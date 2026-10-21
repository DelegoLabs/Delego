import type { NetworkId } from "../../lib/networks";
import { getConfiguredContracts } from "../../lib/contracts";

export interface SpenderContract {
  address: string;
  label: string;
}

export interface TrackedToken {
  address: string;
  symbol: string;
}

/**
 * Known default token addresses per network.
 * Can be extended via NEXT_PUBLIC_TOKEN_CONTRACTS_TESTNET / MAINNET if configured.
 */
export const DEFAULT_TOKENS: Record<NetworkId, TrackedToken[]> = {
  testnet: [
    {
      // Native XLM SAC (Stellar Asset Contract) or default testnet USDC SAC
      address: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
      symbol: "USDC",
    },
    {
      address: "CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA",
      symbol: "XLM",
    },
  ],
  mainnet: [
    {
      address: "CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75",
      symbol: "USDC",
    },
    {
      address: "CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA",
      symbol: "XLM",
    },
  ],
};

/**
 * Returns tracked tokens for a network.
 */
export function getTrackedTokens(networkId: NetworkId): TrackedToken[] {
  const envTokens =
    networkId === "mainnet"
      ? process.env.NEXT_PUBLIC_TOKEN_CONTRACTS_MAINNET
      : process.env.NEXT_PUBLIC_TOKEN_CONTRACTS_TESTNET;

  if (envTokens) {
    try {
      const parsed = JSON.parse(envTokens) as TrackedToken[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    } catch {
      // ignore JSON parse error, fall through
    }
  }

  return DEFAULT_TOKENS[networkId] ?? [];
}

/**
 * Returns the approved spender contracts (escrow, router, permissions) for the network.
 */
export function getSpenderContracts(networkId: NetworkId): SpenderContract[] {
  const contracts = getConfiguredContracts(networkId);
  const spenders: SpenderContract[] = [];

  for (const c of contracts) {
    if (c.address && c.addressValid) {
      spenders.push({
        address: c.address,
        label: `${c.label} Contract`,
      });
    }
  }

  // Also check if an explicit router contract is provided in env
  const routerAddress =
    networkId === "mainnet"
      ? process.env.NEXT_PUBLIC_ROUTER_CONTRACT_ID_MAINNET
      : process.env.NEXT_PUBLIC_ROUTER_CONTRACT_ID_TESTNET;

  if (routerAddress && !spenders.some((s) => s.address === routerAddress)) {
    spenders.push({
      address: routerAddress,
      label: "Router Contract",
    });
  }

  return spenders;
}
