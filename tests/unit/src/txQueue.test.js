import { describe, it, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import { Horizon, rpc, Keypair, StrKey, xdr } from "@stellar/stellar-sdk";
import { 
  addTransactionToQueue, 
  initQueue, 
  closeQueue, 
  getRedisConnection,
  reserveSequenceBlock
} from "../../../apps/backend/wallet/dist/src/queue/txQueue.js";
import { vaultService } from "../../../apps/backend/wallet/dist/src/vault.js";

describe("Wallet Transaction Queue & Sequence Sync", () => {
  let originalLoadAccount;
  let originalSimulate;
  let originalSend;
  let originalGet;
  
  let loadAccountMock;
  let simulateMock;
  let sendMock;
  let getTransactionMock;

  const keypair = Keypair.random();
  const testPub = keypair.publicKey();
  const testSec = keypair.secret();
  const testContractId = StrKey.encodeContract(Buffer.alloc(32));

  // Construct a valid minimal SorobanTransactionData base64 XDR string
  const mockSorobanData = new xdr.SorobanTransactionData({
    ext: new xdr.SorobanTransactionDataExt(0),
    resources: new xdr.SorobanResources({
      footprint: new xdr.LedgerFootprint({
        readOnly: [],
        readWrite: []
      }),
      instructions: 0,
      diskReadBytes: 0,
      writeBytes: 0
    }),
    resourceFee: xdr.Int64.fromString("0")
  });
  const validTransactionDataStr = mockSorobanData.toXDR().toString("base64");

  before(async () => {
    // Enable MockRedis mode for the queue connection
    process.env.MOCK_REDIS = "true";
    process.env.NODE_ENV = "test";
    process.env.VAULT_FILE_PATH = path.join(process.cwd(), "data", "vault_txQueue.json");

    // Backup original Stellar SDK prototypes/methods
    originalLoadAccount = Horizon.Server.prototype.loadAccount;
    originalSimulate = rpc.Server.prototype.simulateTransaction;
    originalSend = rpc.Server.prototype.sendTransaction;
    originalGet = rpc.Server.prototype.getTransaction;

    // Hijack Stellar SDK prototype methods/methods for mocking
    Horizon.Server.prototype.loadAccount = async function(address) {
      if (loadAccountMock) return loadAccountMock(address);
      throw new Error("loadAccountMock not set");
    };

    rpc.Server.prototype.simulateTransaction = async function(tx) {
      if (simulateMock) return simulateMock(tx);
      throw new Error("simulateMock not set");
    };

    rpc.Server.prototype.sendTransaction = async function(tx) {
      if (sendMock) return sendMock(tx);
      throw new Error("sendMock not set");
    };

    rpc.Server.prototype.getTransaction = async function(hash) {
      if (getTransactionMock) return getTransactionMock(hash);
      throw new Error("getTransactionMock not set");
    };

    // Seed test key in vault with verification
    try {
      await vaultService.storeKey(testPub, testSec);
      const storedKey = await vaultService.getKey(testPub);
      if (!storedKey) {
        throw new Error("Key was stored but cannot be retrieved from vault");
      }
    } catch (error) {
      throw new Error(`Failed to initialize vault with test key: ${error.message}`);
    }
  });

  after(async () => {
    // Restore original prototypes
    Horizon.Server.prototype.loadAccount = originalLoadAccount;
    rpc.Server.prototype.simulateTransaction = originalSimulate;
    rpc.Server.prototype.sendTransaction = originalSend;
    rpc.Server.prototype.getTransaction = originalGet;

    await closeQueue();

    // Clean up temporary vault file
    try {
      if (process.env.VAULT_FILE_PATH) {
        await fs.rm(process.env.VAULT_FILE_PATH, { force: true });
      }
    } catch (err) {
      // Ignore
    }
  });

  beforeEach(async () => {
    // Clear Redis cache before each test
    const redis = getRedisConnection();
    await redis.flushall();
  });

  it("should successfully process transaction through the queue", async () => {
    let mockSequence = "100";
    
    // Mock loadAccount to return sequence
    loadAccountMock = async (address) => {
      return {
        sequenceNumber: () => mockSequence,
        accountId: () => address
      };
    };

    // Mock simulateTransaction as successful
    simulateMock = async (tx) => {
      return {
        error: null,
        results: [
          {
            auth: [],
            xdr: xdr.ScVal.scvVoid().toXDR("base64")
          }
        ],
        transactionData: validTransactionDataStr
      };
    };

    // Mock sendTransaction to return a transaction hash
    sendMock = async (tx) => {
      return {
        status: "PENDING",
        hash: "mockedtxhash1234567890abcdef"
      };
    };

    // Mock getTransaction to return successful status
    getTransactionMock = async (hash) => {
      return {
        status: rpc.Api.GetTransactionStatus.SUCCESS,
        ledger: 1024,
        resultXdr: "AAAAAA=="
      };
    };

    const request = {
      sourceAddress: testPub,
      contractId: testContractId,
      method: "test_method",
      args: [123, "test_string"]
    };

    const result = await addTransactionToQueue(request);

    assert.ok(result.success);
    assert.equal(result.hash, "mockedtxhash1234567890abcdef");
    assert.equal(result.ledger, 1024);
  });

  it("should synchronize sequence numbers thread-safely per account in Redis", async () => {
    let mockSequence = "200";
    let loadAccountCallCount = 0;
    
    loadAccountMock = async (address) => {
      loadAccountCallCount++;
      return {
        sequenceNumber: () => mockSequence,
        accountId: () => address
      };
    };

    simulateMock = async (tx) => {
      return {
        error: null,
        results: [
          {
            auth: [],
            xdr: xdr.ScVal.scvVoid().toXDR("base64")
          }
        ],
        transactionData: validTransactionDataStr
      };
    };

    sendMock = async (tx) => {
      return { status: "PENDING", hash: "hash" };
    };

    getTransactionMock = async (hash) => {
      return { status: rpc.Api.GetTransactionStatus.SUCCESS, ledger: 1025 };
    };

    const request1 = {
      sourceAddress: testPub,
      contractId: testContractId,
      method: "method_1",
      args: []
    };

    const request2 = {
      sourceAddress: testPub,
      contractId: testContractId,
      method: "method_2",
      args: []
    };

    // Run two queue jobs sequentially/concurrently
    // Due to queue concurrency of 1, they execute sequentially
    const [res1, res2] = await Promise.all([
      addTransactionToQueue(request1),
      addTransactionToQueue(request2)
    ]);

    assert.ok(res1.success);
    assert.ok(res2.success);

    // Verify Redis has correctly tracked and incremented the sequence number
    const redis = getRedisConnection();
    const cachedSeq = await redis.get(`seq:${testPub}`);
    // Starting ledger sequence is 200.
    // Tx 1 increments to 201.
    // Tx 2 increments to 202.
    assert.equal(cachedSeq, "202");
  });

  it("should retry transactions on transient Horizon/RPC failures", async () => {
    let mockSequence = "300";
    let loadAccountCalls = 0;
    let sendCalls = 0;

    loadAccountMock = async (address) => {
      loadAccountCalls++;
      return {
        sequenceNumber: () => mockSequence,
        accountId: () => address
      };
    };

    simulateMock = async (tx) => {
      return {
        error: null,
        results: [
          {
            auth: [],
            xdr: xdr.ScVal.scvVoid().toXDR("base64")
          }
        ],
        transactionData: validTransactionDataStr
      };
    };

    sendMock = async (tx) => {
      sendCalls++;
      if (sendCalls === 1) {
        // First call fails with transient rate limit error (HTTP 429)
        throw new Error("Submission failed: Rate limit exceeded (429)");
      }
      return { status: "PENDING", hash: "retryhash" };
    };

    getTransactionMock = async (hash) => {
      return { status: rpc.Api.GetTransactionStatus.SUCCESS, ledger: 1026 };
    };

    const request = {
      sourceAddress: testPub,
      contractId: testContractId,
      method: "retry_method",
      args: []
    };

    const result = await addTransactionToQueue(request);

    assert.ok(result.success);
    assert.equal(sendCalls, 2); // Verify it retried once and succeeded on second attempt
    assert.equal(result.hash, "retryhash");
  });

  it("should fail immediately on non-transient fatal errors", async () => {
    loadAccountMock = async (address) => {
      return {
        sequenceNumber: () => "400",
        accountId: () => address
      };
    };

    simulateMock = async (tx) => {
      // Simulate contract panic/validation failure (non-transient)
      throw new Error("Transaction simulation failed: contract panic: Invalid input parameters");
    };

    const request = {
      sourceAddress: testPub,
      contractId: testContractId,
      method: "fatal_method",
      args: []
    };

    await assert.rejects(
      async () => {
        await addTransactionToQueue(request);
      },
      /Invalid input parameters/
    );
  });

  it("should reserve non-overlapping sequence blocks with concurrent workers", async () => {
    let mockSequence = "1000";
    let loadAccountCallCount = 0;
    
    loadAccountMock = async (address) => {
      loadAccountCallCount++;
      return {
        sequenceNumber: () => mockSequence,
        accountId: () => address
      };
    };

    const redis = getRedisConnection();
    const horizonServer = new Horizon.Server("https://horizon-testnet.stellar.org");

    // Simulate 5 concurrent workers each trying to reserve a block
    const reservationPromises = [];
    for (let i = 0; i < 5; i++) {
      reservationPromises.push(
        reserveSequenceBlock(testPub, 10, redis, horizonServer)
      );
    }

    const reservations = await Promise.all(reservationPromises);

    // Collect all reserved sequence ranges
    const ranges = reservations.map(res => ({
      first: BigInt(res.firstSequence),
      last: BigInt(res.lastSequence)
    }));

    // Verify ranges are non-overlapping
    for (let i = 0; i < ranges.length; i++) {
      for (let j = i + 1; j < ranges.length; j++) {
        const a = ranges[i];
        const b = ranges[j];
        
        // Check that ranges don't overlap
        const overlap = !(a.last < b.first || b.last < a.first);
        assert.equal(overlap, false, `Reservations ${i} and ${j} overlap: [${a.first}-${a.last}] and [${b.first}-${b.last}]`);
      }
    }

    // Verify all reservations start after 1000 and each block is 10 sequences
    for (const res of reservations) {
      assert.equal(res.size, 10);
      assert.ok(BigInt(res.firstSequence) > 1000n);
      assert.equal(BigInt(res.lastSequence) - BigInt(res.firstSequence) + 1n, 10n);
    }
  });
});
