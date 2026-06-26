import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import { Horizon, rpc, Keypair, StrKey, xdr } from "@stellar/stellar-sdk";
import { 
  addTransactionToQueue, 
  initQueue, 
  closeQueue, 
  getRedisConnection 
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

  const mockSorobanData = new xdr.SorobanTransactionData({
    ext: new xdr.SorobanTransactionDataExt(0),
    resources: new xdr.SorobanResources({
      footprint: new xdr.LedgerFootprint({ readOnly: [], readWrite: [] }),
      instructions: 0,
      diskReadBytes: 0,
      writeBytes: 0
    }),
    resourceFee: xdr.Int64.fromString("0")
  });
  const validTransactionDataStr = mockSorobanData.toXDR().toString("base64");

  before(async () => {
    process.env.MOCK_REDIS = "true";
    process.env.NODE_ENV = "test";
    process.env.VAULT_FILE_PATH = path.join(process.cwd(), "data", "vault_txQueue.json");

    originalLoadAccount = Horizon.Server.prototype.loadAccount;
    originalSimulate = rpc.Server.prototype.simulateTransaction;
    originalSend = rpc.Server.prototype.sendTransaction;
    originalGet = rpc.Server.prototype.getTransaction;

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

    await initQueue();

    try {
      await vaultService.storeKey(testPub, testSec);
    } catch (error) {
      throw new Error(`Failed to initialize vault: ${error.message}`);
    }
  });

  after(async () => {
    Horizon.Server.prototype.loadAccount = originalLoadAccount;
    rpc.Server.prototype.simulateTransaction = originalSimulate;
    rpc.Server.prototype.sendTransaction = originalSend;
    rpc.Server.prototype.getTransaction = originalGet;

    await closeQueue();

    try {
      if (process.env.VAULT_FILE_PATH) {
        await fs.rm(process.env.VAULT_FILE_PATH, { force: true });
      }
    } catch (err) {
      // Ignore
    }
  });

  beforeEach(async () => {
    const redis = getRedisConnection();
    await redis.flushall();
  });

  it("should successfully process transaction through the queue", async () => {
    let mockSequence = "100";
    
    loadAccountMock = async (address) => {
      return {
        sequenceNumber: () => mockSequence,
        accountId: () => address
      };
    };

    simulateMock = async (tx) => {
      return {
        error: null,
        results: [{ auth: [], xdr: xdr.ScVal.scvVoid().toXDR("base64") }],
        transactionData: validTransactionDataStr
      };
    };

    sendMock = async (tx) => {
      return { status: "PENDING", hash: "mockedtxhash1234567890abcdef" };
    };

    getTransactionMock = async (hash) => {
      return {
        status: rpc.Api.GetTransactionStatus.SUCCESS,
        ledger: 1024,
        resultXdr: "AAAAAA=="
      };
    };

    const request = { sourceAddress: testPub, contractId: testContractId, method: "test_method", args: [123, "test_string"] };
    const result = await addTransactionToQueue(request);

    assert.ok(result.success);
    assert.equal(result.hash, "mockedtxhash1234567890abcdef");
    assert.equal(result.ledger, 1024);
  });

  it("should synchronize sequence numbers thread-safely per account in Redis", async () => {
    let mockSequence = "200";
    
    loadAccountMock = async (address) => {
      return { sequenceNumber: () => mockSequence, accountId: () => address };
    };

    simulateMock = async (tx) => {
      return {
        error: null,
        results: [{ auth: [], xdr: xdr.ScVal.scvVoid().toXDR("base64") }],
        transactionData: validTransactionDataStr
      };
    };

    sendMock = async (tx) => {
      return { status: "PENDING", hash: "hash" };
    };

    getTransactionMock = async (hash) => {
      return { status: rpc.Api.GetTransactionStatus.SUCCESS, ledger: 1025 };
    };

    const request1 = { sourceAddress: testPub, contractId: testContractId, method: "method_1", args: [] };
    const request2 = { sourceAddress: testPub, contractId: testContractId, method: "method_2", args: [] };

    const [res1, res2] = await Promise.all([
      addTransactionToQueue(request1),
      addTransactionToQueue(request2)
    ]);

    assert.ok(res1.success);
    assert.ok(res2.success);

    const redis = getRedisConnection();
    const cachedSeq = await redis.get(`seq:${testPub}`);
    assert.equal(cachedSeq, "202");
  });

  it("should retry transactions on transient Horizon/RPC failures", async () => {
    let mockSequence = "300";
    let sendCalls = 0;

    loadAccountMock = async (address) => {
      return { sequenceNumber: () => mockSequence, accountId: () => address };
    };

    simulateMock = async (tx) => {
      return {
        error: null,
        results: [{ auth: [], xdr: xdr.ScVal.scvVoid().toXDR("base64") }],
        transactionData: validTransactionDataStr
      };
    };

    sendMock = async (tx) => {
      sendCalls++;
      if (sendCalls === 1) {
        return { error: "Submission failed: Rate limit exceeded (429)" };
      }
      return { status: "PENDING", hash: "retryhash" };
    };

    getTransactionMock = async (hash) => {
      return { status: rpc.Api.GetTransactionStatus.SUCCESS, ledger: 1026 };
    };

    const request = { sourceAddress: testPub, contractId: testContractId, method: "retry_method", args: [] };
    const result = await addTransactionToQueue(request);

    assert.ok(result.success);
    assert.equal(sendCalls, 2);
    assert.equal(result.hash, "retryhash");
  });

  it("should fail immediately on non-transient fatal errors", async () => {
    loadAccountMock = async (address) => {
      return { sequenceNumber: () => "400", accountId: () => address };
    };

    // Return the simulation error format instead of throwing a generic JS Error
    simulateMock = async (tx) => {
      return {
        error: "Transaction simulation failed: contract panic: Invalid input parameters",
        results: []
      };
    };

    const request = { sourceAddress: testPub, contractId: testContractId, method: "fatal_method", args: [] };
    const result = await addTransactionToQueue(request);

    // Assert that the function returned a failing status object, and inspect the error message property
    assert.equal(result.success, false);
    assert.match(result.error, /Transaction simulation failed: contract panic: Invalid input param/);
  });
});