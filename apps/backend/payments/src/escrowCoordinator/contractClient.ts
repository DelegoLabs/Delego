import { createHash } from "node:crypto";
import type { ApiResponse, TransactionRequest, TransactionResult } from "@delego/types";
import { createLogger } from "@delego/utils";
import {
  Address,
  Horizon,
  Networks,
  Operation,
  rpc,
  scValToNative,
  TransactionBuilder,
  nativeToScVal,
} from "@stellar/stellar-sdk";
import { getWalletUrl } from "../../escrow/config.js";

const log = createLogger(
  "payments:escrow-coordinator:contract",
  process.env.LOG_LEVEL ?? "info"
);

const STELLAR_STRKEY_RE = /^[GC][A-Z2-7]{55}$/;

function getStellarConfig(): {
  horizonUrl: string;
  rpcUrl: string;
  networkPassphrase: string;
} {
  const network = (process.env.STELLAR_NETWORK ?? "testnet").toLowerCase();
  if (network === "mainnet") {
    return {
      horizonUrl: process.env.STELLAR_HORIZON_URL ?? "https://horizon.stellar.org",
      rpcUrl: process.env.STELLAR_RPC_URL ?? "https://mainnet.sorobanrpc.com",
      networkPassphrase: Networks.PUBLIC,
    };
  }
  if (network === "futurenet") {
    return {
      horizonUrl:
        process.env.STELLAR_HORIZON_URL ?? "https://horizon-futurenet.stellar.org",
      rpcUrl: process.env.STELLAR_RPC_URL ?? "https://rpc-futurenet.stellar.org",
      networkPassphrase: Networks.FUTURENET,
    };
  }
  return {
    horizonUrl: process.env.STELLAR_HORIZON_URL ?? "https://horizon-testnet.stellar.org",
    rpcUrl: process.env.STELLAR_RPC_URL ?? "https://soroban-testnet.stellar.org",
    networkPassphrase: Networks.TESTNET,
  };
}

function argToScVal(arg: unknown) {
  if (typeof arg === "string" && STELLAR_STRKEY_RE.test(arg)) {
    try {
      return Address.fromString(arg).toScVal();
    } catch {
      // Fall back to default encoding when strkey checksum is invalid.
    }
  }
  return nativeToScVal(arg);
}

/** Deterministic 32-byte order reference for on-chain `BytesN<32>`. */
export function orderIdToContractBytes(orderId: string): Buffer {
  const trimmed = orderId.trim();
  const uuidHex = trimmed.replace(/-/g, "");
  if (/^[0-9a-f]{32}$/i.test(uuidHex)) {
    const buf = Buffer.alloc(32);
    Buffer.from(uuidHex, "hex").copy(buf);
    return buf;
  }
  return createHash("sha256").update(trimmed).digest();
}

export async function submitContractInvocation(
  request: TransactionRequest
): Promise<TransactionResult> {
  const walletUrl = getWalletUrl();
  const url = `${walletUrl}/transactions/submit`;

  log.info("Submitting escrow contract invocation via wallet queue", {
    method: request.method,
    contractId: request.contractId,
    sourceAddress: request.sourceAddress,
  });

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sourceAddress: request.sourceAddress,
        contractId: request.contractId,
        method: request.method,
        args: request.args,
        memo: request.memo,
      }),
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to reach wallet service";
    throw new Error(`Wallet service unavailable: ${message}`);
  }

  const rawBody = await response.text();
  let body: ApiResponse<TransactionResult>;
  try {
    body = JSON.parse(rawBody) as ApiResponse<TransactionResult>;
  } catch {
    throw new Error(
      `Wallet service returned invalid response (status ${response.status})`
    );
  }

  if (!response.ok || body.error) {
    throw new Error(
      body.error?.message ?? `Wallet service returned status ${response.status}`
    );
  }

  if (!body.data) {
    throw new Error("Wallet service returned empty transaction result");
  }

  return body.data;
}

export async function extractEscrowIdFromTx(txHash: string): Promise<string> {
  const { rpcUrl } = getStellarConfig();
  const rpcServer = new rpc.Server(rpcUrl);
  const txStatus = await rpcServer.getTransaction(txHash);

  if (txStatus.status !== rpc.Api.GetTransactionStatus.SUCCESS) {
    throw new Error(`Transaction ${txHash} did not succeed on-chain`);
  }

  const successTx = txStatus as rpc.Api.GetSuccessfulTransactionResponse;
  if (successTx.returnValue) {
    const native = scValToNative(successTx.returnValue);
    return String(native);
  }

  throw new Error(`Transaction ${txHash} did not return an escrow ID`);
}

export interface OnChainEscrowRecord {
  escrow_id: number | bigint;
  buyer: string;
  seller: string;
  token: string;
  amount: number | bigint;
  status: unknown;
  order_id: unknown;
  created_at: number | bigint;
  timeout_ledger: number;
}

function normalizeStellarAddress(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "toString" in value) {
    return String(value);
  }
  return String(value);
}

export function mapChainEscrowStatus(status: unknown): "funded" | "released" | "refunded" | "disputed" {
  const raw = String(status).toLowerCase();
  if (raw.includes("release")) return "released";
  if (raw.includes("refund")) return "refunded";
  if (raw.includes("disput")) return "disputed";
  return "funded";
}

export async function readEscrowFromChain(
  escrowContractId: string,
  escrowId: string,
  sourceAddress: string
): Promise<OnChainEscrowRecord> {
  const { horizonUrl, rpcUrl, networkPassphrase } = getStellarConfig();
  const horizon = new Horizon.Server(horizonUrl);
  const rpcServer = new rpc.Server(rpcUrl);
  const account = await horizon.loadAccount(sourceAddress);

  const escrowIdNum = Number(escrowId);
  if (!Number.isInteger(escrowIdNum) || escrowIdNum < 0) {
    throw new Error(`Invalid escrow ID: ${escrowId}`);
  }

  let tx = new TransactionBuilder(account, {
    fee: "100",
    networkPassphrase,
  })
    .addOperation(
      Operation.invokeContractFunction({
        contract: escrowContractId,
        function: "get_escrow",
        args: [argToScVal(escrowIdNum)],
      })
    )
    .setTimeout(30)
    .build();

  const sim = await rpcServer.simulateTransaction(tx);
  if (!rpc.Api.isSimulationSuccess(sim)) {
    throw new Error(`get_escrow simulation failed: ${JSON.stringify(sim)}`);
  }

  const native = scValToNative(sim.result!.retval) as OnChainEscrowRecord;
  return {
    ...native,
    buyer: normalizeStellarAddress(native.buyer),
    seller: normalizeStellarAddress(native.seller),
    token: normalizeStellarAddress(native.token),
  };
}

export function getContractReadSourceAddress(fallbackAddress?: string): string {
  const configured =
    process.env.ESCROW_READ_SOURCE_ADDRESS ??
    process.env.SETTLEMENT_SOURCE_ADDRESS ??
    fallbackAddress;
  if (!configured) {
    throw new Error(
      "ESCROW_READ_SOURCE_ADDRESS or SETTLEMENT_SOURCE_ADDRESS must be configured for on-chain reads"
    );
  }
  return configured;
}
