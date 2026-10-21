import { describe, it, expect, vi } from "vitest";
import { parseAllowanceValue } from "./queryAllowance";

describe("queryAllowance parser", () => {
  it("parses bigint raw values directly", () => {
    const res = parseAllowanceValue(10000000n);
    expect(res).toEqual({ amount: 10000000n, expirationLedger: 0 });
  });

  it("parses number raw values directly", () => {
    const res = parseAllowanceValue(5000);
    expect(res).toEqual({ amount: 5000n, expirationLedger: 0 });
  });

  it("parses object structure with amount and expiration_ledger", () => {
    const res = parseAllowanceValue({
      amount: 25000000n,
      expiration_ledger: 8888,
    });
    expect(res).toEqual({ amount: 25000000n, expirationLedger: 8888 });
  });

  it("returns null for invalid values", () => {
    expect(parseAllowanceValue(null)).toBeNull();
    expect(parseAllowanceValue(undefined)).toBeNull();
    expect(parseAllowanceValue("invalid")).toBeNull();
  });
});
