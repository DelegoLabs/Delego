import { 
  Horizon, 
  rpc, 
  TransactionBuilder, 
  Networks, 
  Operation, 
  nativeToScVal,
  Address,
} from "@stellar/stellar-sdk";
import type { TransactionRequest, TransactionResult } from "@delego/types";
import { createLogger } from "@delego/utils";
import { addTransactionToQueue } from "../src/queue/txQueue.js";

const log = createLogger("wallet:transactions", process.env.LOG_LEVEL ?? "info");

/** Issue #199 — Result of validating a Stellar transaction memo before envelope build. */
export interface MemoValidationResult {
  valid: boolean;
  type: "none" | "text" | "id" | "hash" | "return";
  error?: string;
}

const MEMO_TEXT_MAX_BYTES = 28;
const MEMO_ID_MAX = BigInt("18446744073709551615");
const MEMO_HASH_HEX_LENGTH = 64;
const STELLAR_SECRET_KEY_RE = /^S[A-Z2-7]{55}$/;

export class MemoValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MemoValidationError";
  }
}

function assertValidMemo(memo: unknown): MemoValidationResult {
  const result = validateMemo(memo);
  if (!result.valid) {
    throw new MemoValidationError(result.error ?? "Invalid memo");
  }
  return result;
}

/**
 * Validates memo values before building transaction envelopes.
 * Supports none, text, id, hash, and return memo shapes used by the platform.
 */
export function validateMemo(memo: unknown): MemoValidationResult {
  if (memo === undefined || memo === null || memo === "") {
    return { valid: true, type: "none" };
  }

  if (typeof memo === "number" || typeof memo === "bigint") {
    if (!Number.isInteger(Number(memo)) || memo < 0) {
      return { valid: false, type: "id", error: "Memo id must be a non-negative integer" };
    }
    const idValue = BigInt(memo);
    if (idValue > MEMO_ID_MAX) {
      return { valid: false, type: "id", error: "Memo id exceeds uint64 maximum" };
    }
    return { valid: true, type: "id" };
  }

  if (typeof memo !== "string") {
    return { valid: false, type: "text", error: "Memo must be a string" };
  }

  const trimmed = memo.trim();
  if (trimmed.length === 0) {
    return { valid: false, type: "text", error: "Memo cannot be empty or whitespace only" };
  }

  if (STELLAR_SECRET_KEY_RE.test(trimmed)) {
    return { valid: false, type: "text", error: "Memo must not contain a Stellar secret key" };
  }

  if (/^0x[0-9a-fA-F]{64}$/.test(trimmed)) {
    return { valid: true, type: "hash" };
  }

  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return { valid: true, type: "return" };
  }

  if (/^\d+$/.test(trimmed)) {
    const idValue = BigInt(trimmed);
    if (idValue > MEMO_ID_MAX) {
      return { valid: false, type: "id", error: "Memo id exceeds uint64 maximum" };
    }
    return { valid: true, type: "id" };
  }

  if (/[\x00-\x1f\x7f]/.test(trimmed)) {
    return { valid: false, type: "text", error: "Memo contains invalid control characters" };
  }

  const byteLength = Buffer.byteLength(trimmed, "utf8");
  if (byteLength > MEMO_TEXT_MAX_BYTES) {
    return {
      valid: false,
      type: "text",
      error: `Memo exceeds ${MEMO_TEXT_MAX_BYTES} byte Stellar text limit`,
    };
  }

  if (trimmed.length === MEMO_HASH_HEX_LENGTH && /^[0-9a-fA-F]+$/.test(trimmed)) {
    return { valid: true, type: "hash" };
  }

  return { valid: true, type: "text" };
}

export interface TransactionService {
  submit(request: TransactionRequest): Promise<TransactionResult>;
  simulate(request: TransactionRequest): Promise<rpc.Api.SimulateTransactionResponse>;
}

function getStellarConfig() {
  const network = (process.env.STELLAR_NETWORK ?? "testnet").toLowerCase();
  let horizonUrl = "https://horizon-testnet.stellar.org";
  let rpcUrl = "https://soroban-testnet.stellar.org";
  let networkPassphrase = Networks.TESTNET;

  if (network === "mainnet") {
    horizonUrl = process.env.STELLAR_HORIZON_URL ?? "https://horizon.stellar.org";
    rpcUrl = process.env.STELLAR_RPC_URL ?? "https://rpc.stellar.org";
    networkPassphrase = Networks.PUBLIC;
  } else if (network === "futurenet") {
    horizonUrl = process.env.STELLAR_HORIZON_URL ?? "https://horizon-futurenet.stellar.org";
    rpcUrl = process.env.STELLAR_RPC_URL ?? "https://rpc-futurenet.stellar.org";
    networkPassphrase = Networks.FUTURENET;
  } else {
    horizonUrl = process.env.STELLAR_HORIZON_URL ?? "https://horizon-testnet.stellar.org";
    rpcUrl = process.env.STELLAR_RPC_URL ?? "https://soroban-testnet.stellar.org";
    networkPassphrase = Networks.TESTNET;
  }

  return { horizonUrl, rpcUrl, networkPassphrase };
}

const STELLAR_STRKEY_RE = /^[GC][A-Z2-7]{55}$/;

function argToScVal(arg: unknown): ReturnType<typeof nativeToScVal> {
  if (typeof arg === "string" && STELLAR_STRKEY_RE.test(arg)) {
    try {
      return Address.fromString(arg).toScVal();
    } catch {
      // Fall back to default encoding when strkey checksum is invalid.
    }
  }
  return nativeToScVal(arg);
}

export const transactionService: TransactionService = {
  async simulate(request: TransactionRequest): Promise<rpc.Api.SimulateTransactionResponse> {
    assertValidMemo(request.memo);
    const { horizonUrl, rpcUrl, networkPassphrase } = getStellarConfig();
    log.info("Simulating Soroban transaction...", { request, rpcUrl });

    const horizonServer = new Horizon.Server(horizonUrl);
    const rpcServer = new rpc.Server(rpcUrl);

    try {
      const sourceAccount = await horizonServer.loadAccount(request.sourceAddress);
      
      const scArgs = request.args.map((arg) => argToScVal(arg));
      
      const tx = new TransactionBuilder(sourceAccount, {
        fee: "100",
        networkPassphrase,
      })
        .addOperation(
          Operation.invokeContractFunction({
            contract: request.contractId,
            function: request.method,
            args: scArgs,
          })
        )
        .setTimeout(30)
        .build();

      const simRes = await rpcServer.simulateTransaction(tx);
      log.info("Simulation response received", { 
        error: rpc.Api.isSimulationSuccess(simRes) ? null : "Simulation failed",
        simRes 
      });
      return simRes;
    } catch (err: any) {
      log.error("Simulation error", { error: err.message });
      throw err;
    }
  },

  async submit(request: TransactionRequest): Promise<TransactionResult> {
    assertValidMemo(request.memo);
    log.info("Submitting transaction via resilient queue...", { request });
    return addTransactionToQueue(request);
  },
};
