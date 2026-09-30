"use client";

import { useEffect, useState } from "react";
import { walletAdapters } from "../lib/wallet";
import type { WalletId } from "../lib/wallet";

export interface WalletOption {
  id: WalletId;
  name: string;
  installUrl: string;
  /** Whether the extension is installed — `null` while detection runs. */
  installed: boolean | null;
}

export interface WalletAdaptersState {
  wallets: WalletOption[];
  /** True until every adapter has reported its install state. */
  checking: boolean;
}

/**
 * Probes every registered wallet adapter once so the picker can show
 * "Connect" for installed extensions and an install link for the rest.
 * A detection failure counts as "not installed".
 */
export function useWalletAdapters(): WalletAdaptersState {
  const [detected, setDetected] = useState<Partial<Record<WalletId, boolean>>>({});
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let isMounted = true;

    void Promise.all(
      walletAdapters.map(async (adapter) => {
        let installed = false;
        try {
          installed = await adapter.detect();
        } catch {
          installed = false;
        }
        return [adapter.id, installed] as const;
      })
    ).then((entries) => {
      if (!isMounted) return;
      setDetected(Object.fromEntries(entries));
      setChecking(false);
    });

    return () => {
      isMounted = false;
    };
  }, []);

  return {
    checking,
    wallets: walletAdapters.map((adapter) => ({
      id: adapter.id,
      name: adapter.name,
      installUrl: adapter.installUrl,
      installed: detected[adapter.id] ?? null,
    })),
  };
}
