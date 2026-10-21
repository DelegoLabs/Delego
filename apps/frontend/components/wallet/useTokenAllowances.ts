"use client";

import { useCallback, useEffect, useState } from "react";
import type { TokenAllowanceEntry } from "@delegolabs/types";
import {
  getSpenderContracts,
  getTrackedTokens,
} from "./allowanceConstants";
import type {
  UseTokenAllowancesOptions,
  UseTokenAllowancesReturn,
} from "./allowanceTypes";
import { fetchAllActiveTokenAllowances } from "./queryAllowance";
import { revokeTokenAllowance } from "./revokeAllowance";
import { signWithFreighter } from "../../lib/sorobanInvoke";

export function useTokenAllowances({
  network,
  ownerAddress,
  signTransaction,
  spenderContracts,
  tokens,
}: UseTokenAllowancesOptions): UseTokenAllowancesReturn {
  const [allowances, setAllowances] = useState<TokenAllowanceEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [revokingSpender, setRevokingSpender] = useState<string | null>(null);

  const fetchAllowances = useCallback(async () => {
    if (!ownerAddress) {
      setAllowances([]);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const spenders = spenderContracts ?? getSpenderContracts(network.id);
      const tokenList = tokens ?? getTrackedTokens(network.id);

      const active = await fetchAllActiveTokenAllowances(
        network,
        ownerAddress,
        spenders,
        tokenList
      );
      setAllowances(active);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to query active token allowances."
      );
    } finally {
      setLoading(false);
    }
  }, [network, ownerAddress, spenderContracts, tokens]);

  useEffect(() => {
    void fetchAllowances();
  }, [fetchAllowances]);

  const handleRevoke = useCallback(
    async (entry: TokenAllowanceEntry) => {
      if (!ownerAddress) return;

      const rowKey = `${entry.tokenAddress}-${entry.spenderAddress}`;
      setRevokingSpender(rowKey);
      setError(null);

      try {
        const signer =
          signTransaction ??
          ((xdr: string) =>
            signWithFreighter(xdr, network.networkPassphrase, ownerAddress));

        await revokeTokenAllowance({
          network,
          tokenAddress: entry.tokenAddress,
          ownerAddress,
          spenderAddress: entry.spenderAddress,
          signTransaction: signer,
        });

        // Upon confirmation, remove row from table / set allowance to 0
        setAllowances((prev) =>
          prev.filter(
            (item) =>
              !(
                item.tokenAddress === entry.tokenAddress &&
                item.spenderAddress === entry.spenderAddress
              )
          )
        );
      } catch (err) {
        const msg =
          err instanceof Error
            ? err.message
            : "Failed to revoke token allowance. Please try again.";
        setError(msg);
        throw err;
      } finally {
        setRevokingSpender(null);
      }
    },
    [network, ownerAddress, signTransaction]
  );

  return {
    allowances,
    loading,
    error,
    refetch: fetchAllowances,
    revokingSpender,
    revokeAllowance: handleRevoke,
  };
}
