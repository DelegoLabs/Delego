/**
 * Build → simulate → sign → submit → confirm for a single Soroban contract
 * call signed by the connected wallet.
 */

import {
  BASE_FEE,
  Contract,
  TransactionBuilder,
  rpc,
  type xdr,
} from "@stellar/stellar-sdk";

export interface InvokeContractInput {
  rpcUrl: string;
  networkPassphrase: string;
  contractId: string;
  method: string;
  args?: xdr.ScVal[];
  sourceAddress: string;
  /** Signs the prepared transaction XDR and returns the signed XDR (e.g. Freighter). */
  signTransaction: (xdr: string) => Promise<string>;
  maxPolls?: number;
  pollIntervalMs?: number;
}

export async function invokeContractMethod({
  rpcUrl,
  networkPassphrase,
  contractId,
  method,
  args = [],
  sourceAddress,
  signTransaction,
  maxPolls = 20,
  pollIntervalMs = 1_500,
}: InvokeContractInput): Promise<{ txHash: string }> {
  const server = new rpc.Server(rpcUrl, { allowHttp: rpcUrl.startsWith("http://") });
  const account = await server.getAccount(sourceAddress);

  const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase })
    .addOperation(new Contract(contractId).call(method, ...args))
    .setTimeout(60)
    .build();

  const prepared = await server.prepareTransaction(tx);
  const signedXdr = await signTransaction(prepared.toXDR());
  const signed = TransactionBuilder.fromXDR(signedXdr, networkPassphrase);

  const sent = await server.sendTransaction(signed);
  if (sent.status === "ERROR" || sent.status === "TRY_AGAIN_LATER") {
    throw new Error("The network rejected the transaction. Please try again.");
  }

  for (let attempt = 0; attempt < maxPolls; attempt += 1) {
    const result = await server.getTransaction(sent.hash);
    if (result.status === rpc.Api.GetTransactionStatus.SUCCESS) {
      return { txHash: sent.hash };
    }
    if (result.status === rpc.Api.GetTransactionStatus.FAILED) {
      throw new Error("The transaction failed on-chain.");
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  throw new Error("Timed out waiting for the transaction to confirm.");
}

/** Signs with the Freighter extension; loaded lazily since it only exists in the browser. */
export async function signWithFreighter(
  txXdr: string,
  networkPassphrase: string,
  address: string
): Promise<string> {
  const freighter = await import("@stellar/freighter-api");
  const res = await freighter.signTransaction(txXdr, { networkPassphrase, address });
  if (res.error || !res.signedTxXdr) {
    throw new Error(res.error?.message ?? "Signing was rejected.");
  }
  return res.signedTxXdr;
}
