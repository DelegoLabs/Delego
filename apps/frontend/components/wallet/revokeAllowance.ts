import type { NetworkConfig } from "../../lib/networks";
import type { TokenAllowanceEntry } from "@delegolabs/types";
import { invokeContractMethod } from "../../lib/sorobanInvoke";

export interface RevokeAllowanceInput {
  network: NetworkConfig;
  tokenAddress: string;
  ownerAddress: string;
  spenderAddress: string;
  signTransaction: (xdr: string) => Promise<string>;
}

/**
 * Revokes an allowance on a Soroban token contract by submitting an `approve` call with amount 0.
 * SEP-41 token interface:
 * `approve(from: Address, spender: Address, amount: i128, expiration_ledger: u32)`
 */
export async function revokeTokenAllowance({
  network,
  tokenAddress,
  ownerAddress,
  spenderAddress,
  signTransaction,
}: RevokeAllowanceInput): Promise<{ txHash: string }> {
  const { Address, nativeToScVal } = await import("@stellar/stellar-sdk");

  return invokeContractMethod({
    rpcUrl: network.sorobanRpcUrl,
    networkPassphrase: network.networkPassphrase,
    contractId: tokenAddress,
    method: "approve",
    args: [
      new Address(ownerAddress).toScVal(),
      new Address(spenderAddress).toScVal(),
      nativeToScVal(0n, { type: "i128" }),
      nativeToScVal(0, { type: "u32" }),
    ],
    sourceAddress: ownerAddress,
    signTransaction,
  });
}
