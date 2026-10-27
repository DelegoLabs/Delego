/**
 * React hook for Soroban contract event subscriptions.
 *
 * Provides an EventSubscriptionManager instance that automatically
 * manages WebSocket connections and event delivery.
 *
 * @param config - Subscription configuration
 * @returns EventSubscriptionManager instance
 *
 * @example
 * ```tsx
 * const manager = useSorobanEvents({
 *   networkId: "testnet",
 *   rpcUrl: "https://soroban-testnet.stellar.org",
 * });
 *
 * useEffect(() => {
 *   const unsubscribe = manager.subscribe({
 *     contractId: contractAddress,
 *     topics: ["escrow_created"],
 *     startLedger: lastKnownLedger,
 *     onEvent: handleEvent,
 *     onError: handleError,
 *   });
 *
 *   return unsubscribe;
 * }, [manager, contractAddress]);
 * ```
 */

import { useEffect, useMemo } from "react";
import { useNetwork } from "./useNetwork";
import { createSubscriptionManager, type EventSubscriptionManager } from "../lib/sorobanEvents";

export interface UseSorobanEventsConfig {
  rpcUrl?: string;
}

export function useSorobanEvents(config: UseSorobanEventsConfig = {}): EventSubscriptionManager {
  const { networkId, network } = useNetwork();

  // Get RPC URL - prefer config, fall back to network config
  const rpcUrl = config.rpcUrl || network.sorobanRpcUrl;

  const manager = useMemo(
    () => createSubscriptionManager({ networkId, rpcUrl }),
    [networkId, rpcUrl]
  );

  useEffect(() => {
    return () => {
      manager.destroy();
    };
  }, [manager]);

  return manager;
}