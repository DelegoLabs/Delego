import { describe, it, expect } from "vitest";
import { Keypair, Address } from "@stellar/stellar-sdk";
import type { TransactionRequest } from "@delego/types";
import { submitTransactionBatch, estimateBatchGas } from "./batchSubmitter.js";

describe("batchSubmitter (Issue #342)", () => {
  const sourceAddress = Keypair.random().publicKey();

  const contract1 = Address.contract(Buffer.alloc(32, 1)).toString();
  const contract2 = Address.contract(Buffer.alloc(32, 2)).toString();
  const contract3 = Address.contract(Buffer.alloc(32, 3)).toString();

  const req1: TransactionRequest = {
    sourceAddress,
    contractId: contract1,
    method: "transfer",
    args: ["GBK2S4SJOHDCHI6WCWN3CZ5E235UGONAOIESWF62X532QE6EXRNZ4HQK", 100],
    memo: "tx 1",
  };

  const req2: TransactionRequest = {
    sourceAddress,
    contractId: contract2,
    method: "approve",
    args: ["GASYUC6J6OLTNMYPV2NEDSRKCIQBVENQ6G5KUJZM7MZUGNZVY5ITQTCX", 500],
    memo: "tx 2",
  };

  const req3: TransactionRequest = {
    sourceAddress,
    contractId: contract3,
    method: "lock_escrow",
    args: ["escrow_order_999", 1000],
    memo: "tx 3",
  };

  describe("estimateBatchGas", () => {
    it("estimates lower gas cost for batched submission compared to 3 individual transactions", () => {
      const estimate = estimateBatchGas([req1, req2, req3]);

      // 3 individual txs @ 100 stroops = 300 stroops
      expect(estimate.individualCostStroops).toBe("300");
      // 1 batched tx with 3 ops = 100 + (2 * 10) = 120 stroops
      expect(estimate.batchedCostStroops).toBe("120");
      // Savings = 300 - 120 = 180 stroops
      expect(estimate.savingsStroops).toBe("180");
      // 60% savings
      expect(estimate.savingsPercentage).toBe(60);
    });

    it("handles empty request list", () => {
      const est = estimateBatchGas([]);
      expect(est.individualCostStroops).toBe("0");
      expect(est.batchedCostStroops).toBe("0");
      expect(est.savingsStroops).toBe("0");
    });
  });

  describe("submitTransactionBatch", () => {
    it("combines 3 transactions into a single submission atomically", async () => {
      const result = await submitTransactionBatch([req1, req2, req3]);

      expect(result.success).toBe(true);
      expect(result.batchedCount).toBe(3);
      expect(result.hash).toBeDefined();
      expect(result.savedGasStroops).toBe("180");
    });

    it("rejects when transactions have mismatching source addresses", async () => {
      const otherSource = Keypair.random().publicKey();
      const mismatchedReq: TransactionRequest = { ...req2, sourceAddress: otherSource };

      await expect(
        submitTransactionBatch([req1, mismatchedReq, req3])
      ).rejects.toThrow("All transactions in a batch must have the same sourceAddress");
    });

    it("rejects empty batch submission", async () => {
      await expect(submitTransactionBatch([])).rejects.toThrow("Cannot submit an empty transaction batch");
    });
  });
});
