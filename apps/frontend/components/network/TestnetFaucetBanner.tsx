"use client";

import { useState } from "react";
import { useNetwork } from "../../hooks/useNetwork";
import { useWallet } from "../../hooks/useWallet";
import { useBalanceHistory } from "../../hooks/useBalanceHistory";
import { useFriendbot } from "../../hooks/useFriendbot";

/**
 * Persistent banner shown when the active network is Testnet and the
 * connected wallet has a zero balance — offers 1-click Friendbot funding.
 */
export function TestnetFaucetBanner() {
  const { network } = useNetwork();
  const { address, isConnected } = useWallet();
  const { isUnfunded, refetch } = useBalanceHistory(address, network.horizonUrl, isConnected);
  const { fund, status } = useFriendbot();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  if (network.id !== "testnet" || !isConnected || !address || !isUnfunded || dismissed) {
    return null;
  }

  const handleFund = async () => {
    setErrorMessage(null);
    const result = await fund(address);
    if (result.success) {
      await refetch();
    } else {
      setErrorMessage(result.errorMessage ?? "Funding failed. Please try again.");
    }
  };

  const isFunding = status === "funding";

  return (
    <div
      role="status"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: "0.5rem 1rem",
        background: "#fef3c7",
        color: "#92400e",
        fontSize: "0.8125rem",
      }}
    >
      <span>
        You&apos;re on Testnet with a zero balance. Fund your wallet with test XLM to try Delego.
        {errorMessage && (
          <strong style={{ color: "#dc2626", marginLeft: 8 }}>{errorMessage}</strong>
        )}
      </span>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button
          type="button"
          onClick={handleFund}
          disabled={isFunding}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "0.25rem 0.75rem",
            borderRadius: 6,
            border: "1px solid #92400e",
            background: isFunding ? "#fde68a" : "#fff",
            color: "#92400e",
            fontWeight: 600,
            cursor: isFunding ? "wait" : "pointer",
          }}
        >
          {isFunding && (
            <span
              aria-hidden="true"
              style={{
                display: "inline-block",
                width: 12,
                height: 12,
                borderRadius: "9999px",
                border: "2px solid #92400e",
                borderTopColor: "transparent",
                animation: "delego-spin 0.7s linear infinite",
              }}
            />
          )}
          {isFunding ? "Funding…" : "Fund with Friendbot"}
        </button>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Dismiss"
          style={{ border: "none", background: "transparent", color: "#92400e", cursor: "pointer" }}
        >
          ✕
        </button>
      </div>
      <style>{`@keyframes delego-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
