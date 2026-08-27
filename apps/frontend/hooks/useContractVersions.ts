"use client";

import { useEffect, useState } from "react";
import type { ContractName, ContractVersionInfo } from "@delegolabs/types";
import { apiFetch } from "../lib/apiFetch";
import type { NetworkId } from "../lib/networks";

/** Live-fetched deployed version per contract name, for one network. */
export function useContractVersions(networkId: NetworkId) {
  const [versions, setVersions] = useState<Partial<Record<ContractName, string>>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    apiFetch<ContractVersionInfo[]>(`/contracts/versions?network=${networkId}`)
      .then((res) => {
        if (cancelled) return;
        if (res.error) {
          setError(res.error.message);
        } else {
          const byName: Partial<Record<ContractName, string>> = {};
          for (const info of res.data ?? []) byName[info.name] = info.version;
          setVersions(byName);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to fetch contract versions");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [networkId]);

  return { versions, loading, error };
}
