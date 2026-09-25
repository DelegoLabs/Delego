"use client";

import { useCallback, useState } from "react";

/** Result of a Friendbot funding attempt. */
export interface FaucetFundResponse {
  success: boolean;
  transactionHash?: string;
  fundedAmountXlm: string;
  errorMessage?: string;
}

/** Standard testnet Friendbot funding amount (10,000 XLM). */
const FRIENDBOT_FUND_AMOUNT_XLM = "10000";

/**
 * Calls Stellar's testnet Friendbot to fund `address` with test XLM.
 * Friendbot has no mainnet/mock-USDC equivalent — this only ever funds XLM;
 * callers on testnet can subsequently swap for a mock USDC balance if the
 * app has one configured.
 */
export function useFriendbot() {
  const [status, setStatus] = useState<"idle" | "funding" | "done" | "error">("idle");

  const fund = useCallback(async (address: string): Promise<FaucetFundResponse> => {
    setStatus("funding");
    try {
      const res = await fetch(`https://friendbot.stellar.org?addr=${encodeURIComponent(address)}`);
      const json = (await res.json()) as { hash?: string; detail?: string };
      if (!res.ok) {
        setStatus("error");
        return {
          success: false,
          fundedAmountXlm: "0",
          errorMessage: json.detail ?? `Friendbot request failed (${res.status}).`,
        };
      }
      setStatus("done");
      return {
        success: true,
        transactionHash: json.hash,
        fundedAmountXlm: FRIENDBOT_FUND_AMOUNT_XLM,
      };
    } catch (err) {
      setStatus("error");
      return {
        success: false,
        fundedAmountXlm: "0",
        errorMessage: err instanceof Error ? err.message : "Friendbot request failed.",
      };
    }
  }, []);

  return { fund, status };
}
