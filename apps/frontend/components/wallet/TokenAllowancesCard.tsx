"use client";

import { Card } from "@delegolabs/ui";
import type { TokenAllowanceEntry } from "@delegolabs/types";
import { useNetwork } from "../../hooks/useNetwork";
import { useNotifications } from "../../hooks/useNotifications";
import { useTokenAllowances } from "./useTokenAllowances";
import { TokenAllowancesTable } from "./TokenAllowancesTable";

export interface TokenAllowancesCardProps {
  address: string | null;
  isConnected: boolean;
  disabled?: boolean;
}

export function TokenAllowancesCard({
  address,
  isConnected,
  disabled = false,
}: TokenAllowancesCardProps) {
  const { network } = useNetwork();
  const notifications = useNotifications();

  const {
    allowances,
    loading,
    error,
    revokingSpender,
    revokeAllowance,
    refetch,
  } = useTokenAllowances({
    network,
    ownerAddress: isConnected ? address : null,
  });

  if (!isConnected || !address) {
    return null;
  }

  const handleRevoke = async (entry: TokenAllowanceEntry) => {
    try {
      await revokeAllowance(entry);
      notifications.add({
        type: "success",
        title: "Allowance Revoked",
        message: `Successfully revoked ${entry.tokenSymbol} allowance for ${entry.spenderLabel}.`,
      });
    } catch (err) {
      notifications.add({
        type: "error",
        title: "Revocation Failed",
        message:
          err instanceof Error
            ? err.message
            : "Could not revoke allowance. Please try again.",
      });
    }
  };

  return (
    <Card
      title="Token Allowances"
      ariaLabel="Active Soroban Token Allowances"
    >
      <div className="wallet-allowances-card">
        <p className="settings-toggle-hint" style={{ marginBottom: "1rem" }}>
          Active Soroban token allowances granted to smart contracts (such as
          escrows or routers). Revoking an allowance resets its spending limit to 0.
        </p>

        {error && (
          <p className="settings-status error" role="alert" style={{ marginBottom: "1rem" }}>
            {error}
          </p>
        )}

        <TokenAllowancesTable
          allowances={allowances}
          loading={loading}
          revokingSpenderKey={revokingSpender}
          onRevoke={handleRevoke}
          networkId={network.id}
          disabled={disabled}
        />
      </div>
    </Card>
  );
}
