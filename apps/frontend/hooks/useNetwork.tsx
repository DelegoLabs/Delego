"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";
import {
  getDefaultNetworkId,
  getNetworkConfig,
  isNetworkId,
  NETWORK_STORAGE_KEY,
  NETWORKS,
  type NetworkConfig,
  type NetworkId,
} from "../lib/networks";

interface NetworkContextValue {
  /** The active network id (testnet | mainnet) */
  networkId: NetworkId;
  /** Full config for the active network */
  network: NetworkConfig;
  /** All selectable networks */
  networks: NetworkConfig[];
  /** Switch the active network (persisted to localStorage) */
  setNetwork: (id: NetworkId) => void;
  /** True once the persisted value has been read on the client */
  hydrated: boolean;
}

const NetworkContext = createContext<NetworkContextValue | null>(null);

/**
 * Provides the active Stellar network to the whole app.
 *
 * The selection is persisted in localStorage so it survives reloads and is
 * synced across tabs via the `storage` event. Reads happen after mount to
 * keep the server and first client render identical (avoids hydration drift).
 */
export function NetworkProvider({ children }: { children: ReactNode }) {
  const [networkId, setNetworkId] = useState<NetworkId>(getDefaultNetworkId);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(NETWORK_STORAGE_KEY);
      if (stored && isNetworkId(stored)) {
        setNetworkId(stored);
      }
    } catch {
      // localStorage may be unavailable (private mode) — keep the default.
    }
    setHydrated(true);
  }, []);

  // Keep multiple tabs in sync.
  useEffect(() => {
    function onStorage(event: StorageEvent) {
      if (event.key === NETWORK_STORAGE_KEY && event.newValue) {
        if (isNetworkId(event.newValue)) {
          setNetworkId(event.newValue);
        }
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const setNetwork = useCallback((id: NetworkId) => {
    setNetworkId(id);
    try {
      window.localStorage.setItem(NETWORK_STORAGE_KEY, id);
    } catch {
      // Ignore persistence failures — the in-memory value still updates.
    }
  }, []);

  const value = useMemo<NetworkContextValue>(
    () => ({
      networkId,
      network: getNetworkConfig(networkId),
      networks: Object.values(NETWORKS),
      setNetwork,
      hydrated,
    }),
    [networkId, setNetwork, hydrated]
  );

  return (
    <NetworkContext.Provider value={value}>{children}</NetworkContext.Provider>
  );
}

/** Access the active network. Must be used within a NetworkProvider. */
export function useNetwork(): NetworkContextValue {
  const ctx = useContext(NetworkContext);
  if (!ctx) {
    throw new Error("useNetwork must be used within a NetworkProvider");
  }
  return ctx;
}
