/**
 * Emergency delegation kill-switch (#719).
 *
 * Revokes every agent spending key in a single `revoke_all(owner)` call on
 * the Permissions contract, then optionally asks the gateway to cancel the
 * wallet's pending orders.
 */

import { Address } from "@stellar/stellar-sdk";
import { apiFetch } from "./apiFetch";
import { invokeContractMethod } from "./sorobanInvoke";

export interface KillSwitchPayload {
  walletAddress: string;
  revokeAllDelegations: boolean;
  cancelPendingOrders: boolean;
}

export const KILL_SWITCH_CONFIRM_PHRASE = "REVOKE";

/** Exact, case-sensitive match so a stray keystroke can't arm the switch. */
export function isKillSwitchConfirmed(input: string): boolean {
  return input.trim() === KILL_SWITCH_CONFIRM_PHRASE;
}

export function hasKillSwitchAction(payload: KillSwitchPayload): boolean {
  return payload.revokeAllDelegations || payload.cancelPendingOrders;
}

export interface KillSwitchResult {
  revokeTxHash: string | null;
  cancelledOrders: number | null;
  /** Set when revocation succeeded but cancelling pending orders failed. */
  cancelError: string | null;
}

export interface ExecuteKillSwitchInput {
  payload: KillSwitchPayload;
  rpcUrl: string;
  networkPassphrase: string;
  permissionsContractId: string | null;
  signTransaction: (xdr: string) => Promise<string>;
}

export async function executeKillSwitch({
  payload,
  rpcUrl,
  networkPassphrase,
  permissionsContractId,
  signTransaction,
}: ExecuteKillSwitchInput): Promise<KillSwitchResult> {
  const result: KillSwitchResult = {
    revokeTxHash: null,
    cancelledOrders: null,
    cancelError: null,
  };

  // Revocation goes first: stopping agents from spending is the priority.
  if (payload.revokeAllDelegations) {
    if (!permissionsContractId) {
      throw new Error(
        "No Permissions contract is configured for this network, so delegations can't be revoked on-chain."
      );
    }
    const { txHash } = await invokeContractMethod({
      rpcUrl,
      networkPassphrase,
      contractId: permissionsContractId,
      method: "revoke_all",
      args: [new Address(payload.walletAddress).toScVal()],
      sourceAddress: payload.walletAddress,
      signTransaction,
    });
    result.revokeTxHash = txHash;
  }

  if (payload.cancelPendingOrders) {
    try {
      const res = await apiFetch<{ cancelled: number }>("/orders/cancel-pending", {
        method: "POST",
        body: JSON.stringify({ walletAddress: payload.walletAddress }),
      });
      if (res.error) {
        result.cancelError = res.error.message;
      } else {
        result.cancelledOrders = res.data?.cancelled ?? 0;
      }
    } catch (err) {
      result.cancelError =
        err instanceof Error ? err.message : "Failed to cancel pending orders.";
    }
  }

  return result;
}
