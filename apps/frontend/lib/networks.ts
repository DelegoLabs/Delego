/**
 * Stellar network definitions for the multi-network toggle (#network).
 *
 * The app can operate against either the Stellar test network or the public
 * (main) network. Each definition carries the endpoints and passphrase the
 * SDK / Freighter need. The active choice is persisted in localStorage and
 * shared through the NetworkProvider so every component reads the same value.
 */

export type NetworkId = "testnet" | "mainnet";

export interface NetworkConfig {
  id: NetworkId;
  /** Human-readable label shown in the toggle */
  label: string;
  /** Short label for compact badges */
  shortLabel: string;
  /** Value reported by Freighter's getNetwork() */
  freighterNetwork: "TESTNET" | "PUBLIC";
  /** Network passphrase used when signing transactions */
  networkPassphrase: string;
  /** Horizon REST endpoint */
  horizonUrl: string;
  /** Soroban RPC endpoint */
  sorobanRpcUrl: string;
  /** Whether this network moves real funds (used for UI warnings) */
  isLive: boolean;
}

export const NETWORKS: Record<NetworkId, NetworkConfig> = {
  testnet: {
    id: "testnet",
    label: "Testnet",
    shortLabel: "TEST",
    freighterNetwork: "TESTNET",
    networkPassphrase: "Test SDF Network ; September 2015",
    horizonUrl: "https://horizon-testnet.stellar.org",
    sorobanRpcUrl: "https://soroban-testnet.stellar.org",
    isLive: false,
  },
  mainnet: {
    id: "mainnet",
    label: "Mainnet",
    shortLabel: "MAIN",
    freighterNetwork: "PUBLIC",
    networkPassphrase: "Public Global Stellar Network ; September 2015",
    horizonUrl: "https://horizon.stellar.org",
    sorobanRpcUrl: "https://mainnet.sorobanrpc.com",
    isLive: true,
  },
};

export const NETWORK_IDS = Object.keys(NETWORKS) as NetworkId[];

/** localStorage key holding the user's active network selection. */
export const NETWORK_STORAGE_KEY = "delego_active_network";

/**
 * Default network. Falls back to testnet unless an explicit public network is
 * configured via NEXT_PUBLIC_DEFAULT_NETWORK.
 */
export function getDefaultNetworkId(): NetworkId {
  const configured = process.env.NEXT_PUBLIC_DEFAULT_NETWORK;
  if (configured && isNetworkId(configured)) {
    return configured;
  }
  return "testnet";
}

export function isNetworkId(value: string): value is NetworkId {
  return value === "testnet" || value === "mainnet";
}

export function getNetworkConfig(id: NetworkId): NetworkConfig {
  return NETWORKS[id];
}
