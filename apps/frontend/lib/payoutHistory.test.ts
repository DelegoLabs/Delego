import { describe, expect, it } from "vitest";
import type { PayoutRecord } from "./merchantPayouts";
import {
  PAYOUT_CSV_HEADER,
  buildPayoutCsv,
  filterPayoutsByDate,
  formatStroopsFixed,
  payoutCsvFilename,
  payoutTotalsByToken,
  sortPayoutRows,
  toPayoutHistoryRow,
} from "./payoutHistory";

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);

function record(overrides: Partial<PayoutRecord> = {}): PayoutRecord {
  return {
    id: "pay-1",
    escrowId: "esc-1",
    orderId: "ord-1",
    amountStroops: "1000000000", // 100
    feeStroops: "10000000", // 1
    currency: "USDC",
    transactionHash: HASH_A,
    ledgerClosedAt: "2026-03-15T12:00:00Z",
    ...overrides,
  };
}

describe("toPayoutHistoryRow", () => {
  it("computes net = gross − fee exactly in stroops", () => {
    const row = toPayoutHistoryRow(
      record({ amountStroops: "9007199254740993", feeStroops: "1" })
    );
    // Beyond Number.MAX_SAFE_INTEGER — float math would round this.
    expect(row.netPayoutStroops).toBe("9007199254740992");
    expect(row).toMatchObject({
      payoutId: "pay-1",
      orderId: "ord-1",
      tokenSymbol: "USDC",
      grossAmountStroops: "9007199254740993",
      feeDeductionStroops: "1",
      txHash: HASH_A,
    });
  });

  it("falls back to the escrow id when the record has no order id", () => {
    expect(toPayoutHistoryRow(record({ orderId: undefined })).orderId).toBe("esc-1");
  });
});

describe("formatStroopsFixed", () => {
  it("renders exact 7-decimal amounts", () => {
    expect(formatStroopsFixed("125000000")).toBe("12.5000000");
    expect(formatStroopsFixed(1n)).toBe("0.0000001");
    expect(formatStroopsFixed(0n)).toBe("0.0000000");
    expect(formatStroopsFixed(-10000000n)).toBe("-1.0000000");
  });
});

describe("filterPayoutsByDate / sortPayoutRows", () => {
  const rows = sortPayoutRows(
    [
      record({ id: "jan", ledgerClosedAt: "2026-01-31T23:59:59Z" }),
      record({ id: "feb", ledgerClosedAt: "2026-02-01T00:00:00Z" }),
      record({ id: "mar", ledgerClosedAt: "2026-03-15T12:00:00Z" }),
    ].map(toPayoutHistoryRow)
  );

  it("sorts newest first", () => {
    expect(rows.map((r) => r.payoutId)).toEqual(["mar", "feb", "jan"]);
  });

  it("filters an inclusive UTC date range", () => {
    expect(
      filterPayoutsByDate(rows, { from: "2026-01-31", to: "2026-02-01" }).map((r) => r.payoutId)
    ).toEqual(["feb", "jan"]);
    expect(filterPayoutsByDate(rows, { from: "2026-02-01" }).map((r) => r.payoutId)).toEqual([
      "mar",
      "feb",
    ]);
    expect(filterPayoutsByDate(rows, {})).toHaveLength(3);
  });
});

describe("payoutTotalsByToken", () => {
  it("sums gross, fee and net per token without mixing assets", () => {
    const totals = payoutTotalsByToken(
      [
        record({ id: "1", amountStroops: "1000000000", feeStroops: "10000000" }),
        record({ id: "2", amountStroops: "500000000", feeStroops: "5000000" }),
        record({ id: "3", currency: "XLM", amountStroops: "70000000", feeStroops: "0" }),
      ].map(toPayoutHistoryRow)
    );
    expect(totals.USDC).toEqual({
      grossStroops: 1500000000n,
      feeStroops: 15000000n,
      netStroops: 1485000000n,
      count: 2,
    });
    expect(totals.XLM?.netStroops).toBe(70000000n);
  });
});

describe("buildPayoutCsv", () => {
  it("emits a header plus one formatted line per payout with explorer links", () => {
    const csv = buildPayoutCsv(
      [toPayoutHistoryRow(record()), toPayoutHistoryRow(record({ id: "pay-2", transactionHash: HASH_B }))],
      "mainnet"
    );
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe(PAYOUT_CSV_HEADER.join(","));
    expect(lines[1]).toBe(
      [
        "pay-1",
        "ord-1",
        "2026-03-15T12:00:00.000Z",
        "USDC",
        "100.0000000",
        "1.0000000",
        "99.0000000",
        HASH_A,
        `https://stellar.expert/explorer/public/tx/${HASH_A}`,
      ].join(",")
    );
    expect(lines[2]).toContain(`https://stellar.expert/explorer/public/tx/${HASH_B}`);
    expect(lines).toHaveLength(3);
  });

  it("links to the testnet explorer on testnet", () => {
    expect(buildPayoutCsv([toPayoutHistoryRow(record())], "testnet")).toContain(
      `https://stellar.expert/explorer/testnet/tx/${HASH_A}`
    );
  });

  it("quotes commas and neutralises formula injection in text columns", () => {
    const csv = buildPayoutCsv(
      [toPayoutHistoryRow(record({ id: "=HYPERLINK(\"x\")", orderId: "a,b" }))],
      "testnet"
    );
    const line = csv.split("\r\n")[1]!;
    expect(line.startsWith(`"'=HYPERLINK(""x"")"`)).toBe(true);
    expect(line).toContain(`"a,b"`);
  });
});

describe("payoutCsvFilename", () => {
  it("names the file after the range", () => {
    expect(payoutCsvFilename({})).toBe("delego-payouts-all.csv");
    expect(payoutCsvFilename({ from: "2026-01-01", to: "2026-03-31" })).toBe(
      "delego-payouts-2026-01-01_to_2026-03-31.csv"
    );
    expect(payoutCsvFilename({ from: "2026-01-01" })).toBe(
      "delego-payouts-2026-01-01_to_today.csv"
    );
  });
});
