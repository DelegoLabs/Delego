"use client";

import { useEffect, useState } from "react";
import { useNetwork } from "./useNetwork";
import type { PathPaymentEstimate } from "@delegolabs/ui";

interface HorizonPathRecord {
  source_asset_type: string;
  source_asset_code?: string;
  source_amount: string;
  destination_asset_type: string;
  destination_asset_code?: string;
  destination_amount: string;
  path: { asset_code?: string; asset_type: string }[];
}

function assetLabel(assetType: string, assetCode?: string): string {
  return assetType === "native" ? "XLM" : (assetCode ?? assetType);
}

/**
 * Fetches a live strict-receive path-payment quote from Stellar Horizon:
 * "how much of sourceAsset do I need to pay so the destination receives
 * exactly destinationAmount of destinationAsset". Returns the cheapest
 * (first) path Horizon reports, with a fixed slippage tolerance applied to
 * `sourceAmountMax`.
 */
export function usePathPaymentEstimate(
  sourceAssetCode: string,
  destinationAssetCode: string,
  destinationAmount: string,
  sourceAccount: string | null,
  slippageTolerancePercent = 0.5
): { estimate: PathPaymentEstimate | null; loading: boolean } {
  const { network } = useNetwork();
  const [estimate, setEstimate] = useState<PathPaymentEstimate | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (
      !sourceAccount ||
      !destinationAmount ||
      Number(destinationAmount) <= 0 ||
      sourceAssetCode === destinationAssetCode
    ) {
      setEstimate(null);
      return;
    }

    let cancelled = false;
    setLoading(true);

    const params = new URLSearchParams({
      source_account: sourceAccount,
      destination_account: sourceAccount,
      destination_amount: destinationAmount,
      destination_asset_type: destinationAssetCode === "XLM" ? "native" : "credit_alphanum4",
      ...(destinationAssetCode !== "XLM" ? { destination_asset_code: destinationAssetCode } : {}),
    });

    fetch(`${network.horizonUrl}/paths/strict-receive?${params.toString()}`)
      .then((res) => res.json())
      .then((json: { _embedded?: { records?: HorizonPathRecord[] } }) => {
        if (cancelled) return;
        const record = json._embedded?.records?.[0];
        if (!record) {
          setEstimate(null);
          return;
        }
        const sourceAmount = Number(record.source_amount);
        const sourceAmountMax = (sourceAmount * (1 + slippageTolerancePercent / 100)).toFixed(7);
        const estimatedRate = (Number(record.destination_amount) / sourceAmount).toFixed(7);
        setEstimate({
          sourceAsset: assetLabel(record.source_asset_type, record.source_asset_code),
          destinationAsset: assetLabel(record.destination_asset_type, record.destination_asset_code),
          sourceAmountMax,
          destinationAmount: record.destination_amount,
          estimatedRate,
          slippageTolerancePercent,
          path: record.path.map((p) => assetLabel(p.asset_type, p.asset_code)),
        });
      })
      .catch(() => {
        if (!cancelled) setEstimate(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    sourceAccount,
    sourceAssetCode,
    destinationAssetCode,
    destinationAmount,
    network.horizonUrl,
    slippageTolerancePercent,
  ]);

  return { estimate, loading };
}
