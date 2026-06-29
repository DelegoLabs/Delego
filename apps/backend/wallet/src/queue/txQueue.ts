import { Queue, Worker, QueueEvents, UnrecoverableError } from "bullmq";
import { Redis } from "ioredis";
// @ts-ignore
import MockRedis from "ioredis-mock";
import { 
  Keypair, 
  Horizon, 
  rpc, 
  TransactionBuilder, 
  Networks, 
  Operation, 
  nativeToScVal,
  Address,
  Account
} from "@stellar/stellar-sdk";
import type { TransactionRequest, TransactionResult } from "@delego/types";
import { vaultService } from "../vault.js";
import { createLogger } from "@delego/utils";
import {
  classifySubmissionFailure,
  type SubmissionFailure,
} from "./submissionFailure.js";

export { classifySubmissionFailure, type SubmissionFailure } from "./submissionFailure.js";

const log = createLogger("wallet:queue", process.env.LOG_LEVEL ?? "info");

let redisClient: Redis;
let txQueue: Queue | null = null;
let txWorker: Worker | null = null;
let queueEvents: QueueEvents | null = null;

export interface TransactionJobStatus {
  jobId: string;
  status: "queued" | "processing" | "submitted" | "failed";
  txHash?: string;
  error?: string;
}

export interface LedgerSubmissionCheck {
  txHash: string;
  status: "confirmed" | "missing" | "failed";
  ledger?: number;
  checkedAt: string;
}

function throwClassifiedSubmissionFailure(
  failure: SubmissionFailure,
  attempt: number
): never {
  log.error("Transaction error in worker", {
    code: failure.code,
    message: failure.message,
    retryable: failure.retryable,
    txHash: failure.txHash,
  });

  if (failure.retryable) {
    log.warn(`Retryable submission failure. Attempt ${attempt}/5`, {
      code: failure.code,
    });
    throw new Error(failure.message);
  }

  log.error("Terminal submission failure, failing job without retry", {
    code: failure.code,
  });
  throw new UnrecoverableError(`${failure.code}: ${failure.message}`);
}

const QUEUE_NAME = "stellar-tx-queue";

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

// Check if we should use MockRedis (for testing or if Redis is not configured)
export function getRedisConnection(): Redis {
  if (redisClient) return redisClient;

  const isTest = process.env.NODE_ENV === "test";
  const redisUrl = process.env.REDIS_URL;
  const redisHost = process.env.REDIS_HOST ?? "localhost";
  const redisPort = Number(process.env.REDIS_PORT ?? 6379);

  if (isTest || (!redisUrl && redisHost === "localhost" && process.env.MOCK_REDIS === "true")) {
    log.info("Using mock Redis connection");
    const MockRedisConstructor = MockRedis as any;
    redisClient = new MockRedisConstructor();
  } else {
    log.info("Connecting to real Redis", { redisUrl, redisHost, redisPort });
    if (redisUrl) {
      redisClient = new Redis(redisUrl, { maxRetriesPerRequest: null });
    } else {
      redisClient = new Redis({
        host: redisHost,
        port: redisPort,
        maxRetriesPerRequest: null
      });
    }

    redisClient.on("error", (err: any) => {
      log.error("Redis connection error", { error: err.message });
    });
  }

  return redisClient;
}

// Synchronize and manage sequence numbers thread-safely per source address in Redis
async function getNextSequenceNumber(
  horizonServer: Horizon.Server,
  sourceAddress: string,
  redis: Redis,
  attempt: number
): Promise<{ sequence: string; resetCache: () => Promise<void> }> {
  const cacheKey = `seq:${sourceAddress}`;
  
  const resetCache = async () => {
    await redis.del(cacheKey);
    log.info("Cleared cached sequence number from Redis", { sourceAddress });
  };

  // If this is a retry attempt, clear the cached sequence number from Redis to force a fresh reload from Horizon
  if (attempt > 1) {
    await resetCache();
  }

  // Load account from Horizon to get the source account details
  log.info("Loading account details from Horizon...", { sourceAddress });
  const sourceAccount = await horizonServer.loadAccount(sourceAddress);
  const ledgerSequence = BigInt(sourceAccount.sequenceNumber());

  // Check Redis for cached sequence number
  const cachedSeqStr = await redis.get(cacheKey);
  
  let nextSequence: bigint;
  if (cachedSeqStr) {
    const cachedSequence = BigInt(cachedSeqStr);
    // Use the maximum of ledger sequence and cached sequence
    if (cachedSequence >= ledgerSequence) {
      nextSequence = cachedSequence + 1n;
    } else {
      nextSequence = ledgerSequence + 1n;
    }
  } else {
    nextSequence = ledgerSequence + 1n;
  }

  // Save the new sequence number back to Redis with a TTL of 60 seconds
  await redis.set(cacheKey, nextSequence.toString(), "EX", 60);
  log.info("Determined sequence number", { 
    sourceAddress, 
    ledgerSequence: ledgerSequence.toString(), 
    cachedSequence: cachedSeqStr ?? "none",
    usingSequence: nextSequence.toString() 
  });

  // Return the sequence number minus 1 to build with since TransactionBuilder increments it
  const buildSequence = (nextSequence - 1n).toString();
  return { sequence: buildSequence, resetCache };
}

async function executeTxJob(
  request: TransactionRequest, 
  attempt: number, 
  connection: Redis
): Promise<TransactionResult> {
  const { horizonUrl, rpcUrl, networkPassphrase } = getStellarConfig();
  const horizonServer = new Horizon.Server(horizonUrl);
  const rpcServer = new rpc.Server(rpcUrl);

  // 1. Fetch private key from Vault
  const secret = await vaultService.getKey(request.sourceAddress);
  const signerKeypair = Keypair.fromSecret(secret);

  // 2. Thread-safe sequence number retrieval
  const { sequence, resetCache } = await getNextSequenceNumber(
    horizonServer,
    request.sourceAddress,
    connection,
    attempt
  );

  // Create dummy Account object with current sequence number
  const account = new Account(request.sourceAddress, sequence);
  let txHash: string | undefined;

  try {
    // 3. Convert arguments to ScVals
    const scArgs = request.args.map((arg) => argToScVal(arg));

    // 4. Build draft transaction using the thread-safe sequence number
    let tx = new TransactionBuilder(account, {
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

    // 5. Simulate to construct Soroban footprint details
    log.info("Simulating transaction to estimate gas and footprint...");
    const simRes = await rpcServer.simulateTransaction(tx);

    if (!rpc.Api.isSimulationSuccess(simRes)) {
      throw new Error(`Transaction simulation failed: ${JSON.stringify(simRes)}`);
    }

    // 6. Assemble transaction with footprints and sign
    tx = rpc.assembleTransaction(tx, simRes).build();
    tx.sign(signerKeypair);

    // 7. Submit transaction to RPC server
    log.info("Submitting transaction to Stellar network...", { hash: tx.hash().toString("hex") });
    let sendRes = await rpcServer.sendTransaction(tx);

    if (sendRes.status === "ERROR") {
      const errorMsg = JSON.stringify(sendRes);
      // If sequence number error, clear cache so we fetch fresh next time
      if (errorMsg.includes("tx_bad_seq") || errorMsg.includes("bad_seq")) {
        await resetCache();
      }
      throw new Error(`Submission failed: ${errorMsg}`);
    }

    // 8. Poll for transaction result
    txHash = sendRes.hash;
    log.info("Waiting for transaction confirmation...", { txHash });
    
    let retries = 12; // Poll for ~1 minute (5s intervals)
    
    while (retries > 0) {
      await new Promise((resolve) => setTimeout(resolve, process.env.NODE_ENV === "test" ? 10 : 5000));
      const txStatus = await rpcServer.getTransaction(txHash);
      
      if (txStatus.status === rpc.Api.GetTransactionStatus.SUCCESS) {
        const successTx = txStatus as rpc.Api.GetSuccessfulTransactionResponse;
        log.info("Transaction completed successfully", { txHash });

        // Record spend in Redis after successful confirmation
        if (request.userId && request.walletId && request.amountStroops) {
          try {
            const { recordSpend } = await import("../spendLimits.js");
            const amount = BigInt(request.amountStroops);
            if (amount > 0n) {
              await recordSpend(request.userId, request.walletId, amount);
            }
          } catch (err: any) {
            log.error("Failed to record spend in Redis", { error: err.message });
          }
        }

        return {
          hash: txHash,
          ledger: successTx.ledger,
          success: true
        };
      } else if (txStatus.status === rpc.Api.GetTransactionStatus.FAILED) {
        const failedTx = txStatus as rpc.Api.GetFailedTransactionResponse;
        const errXdrStr = typeof failedTx.resultXdr === "string" 
          ? failedTx.resultXdr 
          : failedTx.resultXdr?.toXDR().toString("base64") ?? "Unknown error XDR";
        
        log.error("Transaction execution failed", { txHash, error: errXdrStr });
        
        // Check if failure is transient or if it's a sequence error
        if (errXdrStr.includes("tx_bad_seq") || errXdrStr.includes("bad_seq")) {
          await resetCache();
        }
        throw new Error(`Transaction failed: ${errXdrStr}`);
      }
      
      retries--;
    }

    const isConfirmed = await verifyLedgerSubmission(txHash);
    if (isConfirmed) {
      log.info("Transaction confirmed on ledger despite polling timeout", { txHash });
      return { hash: txHash, ledger: 0, success: true };
    }
    throw new Error(`Transaction timeout or status untracked: ${sendRes.status}`);
  } catch (err: unknown) {
    const failure = classifySubmissionFailure(err, { txHash });
    throwClassifiedSubmissionFailure(failure, attempt);
  }
}

let testPromiseChain = Promise.resolve();

async function runTestJob(request: TransactionRequest, connection: Redis): Promise<TransactionResult> {
  const resultPromise = testPromiseChain.then(async () => {
    let attemptsMade = 0;
    const maxAttempts = 5;
    
    while (attemptsMade < maxAttempts) {
      try {
        const result = await executeTxJob(request, attemptsMade + 1, connection);
        return result;
      } catch (err: unknown) {
        attemptsMade++;
        if (err instanceof UnrecoverableError) {
          throw err;
        }

        const failure = classifySubmissionFailure(err);
        if (failure.retryable && attemptsMade < maxAttempts) {
          log.warn(`Test runner: Retryable submission failure, retrying... Attempt ${attemptsMade}/${maxAttempts}`, {
            code: failure.code,
          });
          await new Promise((resolve) => setTimeout(resolve, 50));
          continue;
        }
        throw err;
      }
    }
    throw new Error("Job failed after max attempts");
  });

  // Append to the chain, swallowing errors so subsequent tests run
  testPromiseChain = resultPromise.then(() => {}).catch(() => {});

  return resultPromise;
}

async function verifyLedgerSubmission(hash: string): Promise<boolean> {
  const { horizonUrl } = getStellarConfig();
  const horizonServer = new Horizon.Server(horizonUrl);

  try {
    await horizonServer.transactions().transaction(hash).call();
    return true;
  } catch (err: any) {
    if (err?.response?.status === 404) {
      return false;
    }
    return false;
  }
}

export function initQueue() {
  const isTest = process.env.NODE_ENV === "test";
  if (isTest) {
    return { txQueue: null, txWorker: null, queueEvents: null };
  }

  if (txQueue) return { txQueue, txWorker, queueEvents };

  const connection = getRedisConnection();

  txQueue = new Queue(QUEUE_NAME, {
    connection: connection as any,
    defaultJobOptions: {
      attempts: 5,
      backoff: {
        type: "exponential",
        delay: 2000, // Start with 2s backoff
      },
      removeOnComplete: true,
      removeOnFail: false,
    }
  });

  // Concurrency set to 1 ensures that jobs are executed in strict order
  txWorker = new Worker(
    QUEUE_NAME,
    async (job) => {
      const attempt = job.attemptsMade + 1;
      log.info(`Processing transaction job ${job.id}`, { attempt, request: job.data });
      return executeTxJob(job.data, attempt, connection);
    },
    {
      connection: connection as any,
      concurrency: 1, // Strict sequential processing
    }
  );

  queueEvents = new QueueEvents(QUEUE_NAME, { connection: connection as any });

  return { txQueue, txWorker, queueEvents };
}

export async function addTransactionToQueue(request: TransactionRequest): Promise<TransactionResult> {
  // Check spend limit first
  let userId = request.userId;
  let walletId = request.walletId;
  const delegationId = request.delegationId ?? null;
  const amountStroops = request.amountStroops ? BigInt(request.amountStroops) : 0n;

  if (!userId || !walletId) {
    try {
      const { Wallet } = await import("../models/Wallet.js");
      const wallet = await Wallet.findOne({
        where: { stellarAddress: request.sourceAddress }
      });
      if (wallet) {
        userId = userId || wallet.userId;
        walletId = walletId || wallet.id;
      }
    } catch (err: any) {
      log.warn("Could not load wallet from DB for limit check, continuing without limit checks", { error: err.message });
    }
  }

  if (userId && walletId) {
    try {
      const { checkSpendLimit } = await import("../spendLimits.js");
      const checkResult = await checkSpendLimit(userId, walletId, delegationId, amountStroops);
      if (!checkResult.allowed) {
        throw new Error(`Spending limit exceeded: ${checkResult.reason || "limit exceeded"}`);
      }
      request.userId = userId;
      request.walletId = walletId;
      request.delegationId = delegationId;
      request.amountStroops = amountStroops.toString();
    } catch (err: any) {
      if (err.message.includes("Spending limit exceeded")) {
        throw err;
      }
      log.warn("Could not check spend limit due to DB error, continuing", { error: err.message });
    }
  }

  const isTest = process.env.NODE_ENV === "test";
  const connection = getRedisConnection();

  if (isTest) {
    log.info("Running transaction in test mode (bypassing BullMQ)");
    return runTestJob(request, connection);
  }

  const { txQueue } = initQueue();
  if (!txQueue) {
    throw new Error("Transaction queue is not initialized");
  }

  // Create a unique job ID per source address to guarantee order if desired, or let BullMQ handle auto IDs
  const job = await txQueue.add("submit-tx", request);
  log.info(`Enqueued transaction job ${job.id}`, { request });

  // Wait for the job to complete and return the result
  const { queueEvents: qEvents } = initQueue();
  if (!qEvents) {
    throw new Error("QueueEvents is not initialized");
  }

  return new Promise<TransactionResult>((resolve, reject) => {
    const onCompleted = ({ jobId, returnvalue }: { jobId: string, returnvalue: string }) => {
      if (jobId === job.id) {
        cleanup();
        try {
          const result = JSON.parse(returnvalue) as TransactionResult;
          resolve(result);
        } catch (e) {
          // If returnvalue is already an object
          resolve(returnvalue as unknown as TransactionResult);
        }
      }
    };

    const onFailed = ({ jobId, failedReason }: { jobId: string, failedReason: string }) => {
      if (jobId === job.id) {
        cleanup();
        reject(new Error(failedReason || "Transaction job failed in worker"));
      }
    };

    const cleanup = () => {
      qEvents.off("completed", onCompleted);
      qEvents.off("failed", onFailed);
    };

    qEvents.on("completed", onCompleted);
    qEvents.on("failed", onFailed);
  });
}

export async function getJobStatus(jobId: string): Promise<TransactionJobStatus | null> {
  const { txQueue: queue } = initQueue();
  if (!queue) {
    return null;
  }

  const job = await queue.getJob(jobId);
  if (!job) {
    return null;
  }

  const state = await job.getState();
  let status: TransactionJobStatus["status"];

  if (state === "waiting" || state === "delayed" || state === "waiting-children") {
    status = "queued";
  } else if (state === "active") {
    status = "processing";
  } else if (state === "completed") {
    status = "submitted";
  } else if (state === "failed") {
    status = "failed";
  } else {
    // unknown or any future BullMQ state — treat as queued rather than failed
    status = "queued";
  }

  const result: TransactionJobStatus = { jobId, status };

  if (state === "completed" && job.returnvalue) {
    try {
      const rv =
        typeof job.returnvalue === "string"
          ? (JSON.parse(job.returnvalue) as { hash?: string })
          : (job.returnvalue as { hash?: string });
      if (rv.hash) result.txHash = rv.hash;
    } catch {
      // returnvalue not parseable — leave txHash unset
    }
  }

  if (state === "failed" && job.failedReason) {
    result.error = job.failedReason;
  }

  return result;
}

export async function closeQueue() {
  if (txWorker) {
    await txWorker.close();
    txWorker = null;
  }
  if (queueEvents) {
    await queueEvents.close();
    queueEvents = null;
  }
  if (txQueue) {
    await txQueue.close();
    txQueue = null;
  }
  if (redisClient) {
    await redisClient.quit();
    // @ts-ignore
    redisClient = null;
  }
}
