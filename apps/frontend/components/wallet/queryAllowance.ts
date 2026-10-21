import type { NetworkConfig } from "../../lib/networks";
import type { TokenAllowanceEntry } from "@delegolabs/types";
import type { SpenderContract, TrackedToken } from "./allowanceConstants";

const SIMULATION_SOURCE = "GCKKRU2H27A4O3MR2IYLXR4RQY5EJFNIWN5VZGZIEG4UIKVE5RN4BPA7";

export interface QueryAllowanceParams {
  network: NetworkConfig;
  tokenAddress: string;
  fromAddress: string;
  spenderAddress: string;
}

export interface RawAllowanceResult {
  amount: bigint;
  expirationLedger: number;
}

/**
 * Queries the Soroban token contract `allowance(from: Address, spender: Address)`
 * via a simulated read call (no signing, no gas cost, no state change).
 */
export async function querySorobanTokenAllowance({
  network,
  tokenAddress,
  fromAddress,
  spenderAddress,
}: QueryAllowanceParams): Promise<RawAllowanceResult | null> {
  const { Account, Contract, TransactionBuilder, Address, scValToNative, rpc } =
    await import("@stellar/stellar-sdk");

  const server = new rpc.Server(network.sorobanRpcUrl, {
    allowHttp: network.sorobanRpcUrl.startsWith("http://"),
  });
  const account = new Account(SIMULATION_SOURCE, "0");
  const contract = new Contract(tokenAddress);

  const tx = new TransactionBuilder(account, {
    fee: "100",
    networkPassphrase: network.networkPassphrase,
  })
    .addOperation(
      contract.call(
        "allowance",
        new Address(fromAddress).toScVal(),
        new Address(spenderAddress).toScVal()
      )
    )
    .setTimeout(30)
    .build();

  const simulated = await server.simulateTransaction(tx);

  if (rpc.Api.isSimulationError(simulated)) {
    return null;
  }
  if (!simulated.result || !simulated.result.retval) {
    return null;
  }

  const raw = scValToNative(simulated.result.retval);
  return parseAllowanceValue(raw);
}

/**
 * Normalizes the raw decoded return value of `allowance`.
 * SEP-41 standard returns `i128` (or an object with `amount` and `live_until_ledger` / `expiration_ledger`).
 */
export function parseAllowanceValue(raw: unknown): RawAllowanceResult | null {
  if (typeof raw === "bigint") {
    return { amount: raw, expirationLedger: 0 };
  }

  if (typeof raw === "number") {
    return { amount: BigInt(raw), expirationLedger: 0 };
  }

  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    const amountVal = obj.amount ?? obj.allowed ?? 0n;
    const amount =
      typeof amountVal === "bigint"
        ? amountVal
        : typeof amountVal === "number" || typeof amountVal === "string"
          ? BigInt(amountVal)
          : 0n;

    const expVal =
      obj.expiration_ledger ??
      obj.expirationLedger ??
      obj.live_until_ledger ??
      obj.liveUntilLedger ??
      0;

    const expirationLedger = typeof expVal === "number" ? expVal : Number(expVal) || 0;

    return { amount, expirationLedger };
  }

  return null;
}

/**
 * Queries active allowances for all approved spenders across tracked tokens.
 * Only returns entries where allowed amount > 0.
 */
export async function fetchAllActiveTokenAllowances(
  network: NetworkConfig,
  fromAddress: string,
  spenders: SpenderContract[],
  tokens: TrackedToken[]
): Promise<TokenAllowanceEntry[]> {
  const entries: TokenAllowanceEntry[] = [];

  for (const token of tokens) {
    for (const spender of spenders) {
      try {
        const res = await querySorobanTokenAllowance({
          network,
          tokenAddress: token.address,
          fromAddress,
          spenderAddress: spender.address,
        });

        if (res && res.amount > 0n) {
          entries.push({
            tokenAddress: token.address,
            tokenSymbol: token.symbol,
            spenderAddress: spender.address,
            spenderLabel: spender.label,
            allowedAmountStroops: res.amount.toString(),
            expirationLedger: res.expirationLedger,
          });
        }
      } catch {
        // Skip on error for individual query so others can still be retrieved
      }
    }
  }

  return entries;
}
