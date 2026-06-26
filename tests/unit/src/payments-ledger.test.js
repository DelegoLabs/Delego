import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { logSubmission, updateLedgerStatus } from "../../../apps/backend/payments/dist/events/index.js";
import { SorobanTransactionLedger } from "../../../apps/backend/payments/dist/src/models/SorobanTransactionLedger.js";

describe("Soroban Transaction Ledger", () => {
  let originalFindOrCreate;
  let originalFindByPk;

  let mockLedgerEntries = {};

  before(() => {
    originalFindOrCreate = SorobanTransactionLedger.findOrCreate;
    originalFindByPk = SorobanTransactionLedger.findByPk;

    // Stub findOrCreate
    SorobanTransactionLedger.findOrCreate = async ({ where, defaults }) => {
      const hash = where.hash;
      const exists = mockLedgerEntries[hash];
      if (exists) {
        return [exists, false];
      }
      const newEntry = {
        ...defaults,
        save: async function () {
          mockLedgerEntries[this.hash] = this;
          return this;
        },
      };
      mockLedgerEntries[hash] = newEntry;
      return [newEntry, true];
    };

    // Stub findByPk
    SorobanTransactionLedger.findByPk = async (hash) => {
      return mockLedgerEntries[hash] || null;
    };
  });

  after(() => {
    SorobanTransactionLedger.findOrCreate = originalFindOrCreate;
    SorobanTransactionLedger.findByPk = originalFindByPk;
  });

  it("should log transaction submission with PENDING status", async () => {
    const hash = "0000000000000000000000000000000000000000000000000000000000000001";
    const method = "create_escrow";
    const orderId = "order_123";
    const contractId = "contract_abc";

    const entry = await logSubmission(hash, method, orderId, contractId);
    assert.equal(entry.hash, hash);
    assert.equal(entry.method, method);
    assert.equal(entry.status, "PENDING");
    assert.equal(entry.orderId, orderId);
    assert.equal(entry.contractId, contractId);
  });

  it("should update ledger status to CONFIRMED", async () => {
    const hash = "0000000000000000000000000000000000000000000000000000000000000001";
    
    const entry = await updateLedgerStatus(hash, "CONFIRMED");
    assert.equal(entry.status, "CONFIRMED");
    assert.ok(entry.confirmedAt);
    assert.equal(entry.errorDetails, null);
  });

  it("should update ledger status to FAILED with error details", async () => {
    const hash = "0000000000000000000000000000000000000000000000000000000000000001";
    
    const entry = await updateLedgerStatus(hash, "FAILED", "Simulation failed");
    assert.equal(entry.status, "FAILED");
    assert.equal(entry.errorDetails, "Simulation failed");
  });
});
