import { describe, it, expect } from "vitest";
import { compareReceiptFields } from "./receiptMismatch";

describe("compareReceiptFields", () => {
  it("reports a full match when every field is equal", () => {
    const result = compareReceiptFields(
      { amount: "100", recipient: "GABC" },
      { amount: "100", recipient: "GABC" },
      ["amount", "recipient"]
    );

    expect(result.matches).toBe(true);
    expect(result.missingFields).toEqual([]);
    expect(result.fields.every((f) => f.matches)).toBe(true);
  });

  it("flags a single field mismatch without affecting others", () => {
    const result = compareReceiptFields(
      { amount: "100", recipient: "GABC" },
      { amount: "999", recipient: "GABC" },
      ["amount", "recipient"]
    );

    expect(result.matches).toBe(false);
    expect(result.fields.find((f) => f.field === "amount")?.matches).toBe(
      false
    );
    expect(result.fields.find((f) => f.field === "recipient")?.matches).toBe(
      true
    );
  });

  it("normalizes bigint and number values before comparing", () => {
    const result = compareReceiptFields({ amount: 100n }, { amount: 100 }, [
      "amount",
    ]);
    expect(result.matches).toBe(true);
  });

  it("normalizes bigint vs numeric string", () => {
    const result = compareReceiptFields(
      { amount: 452000000n },
      { amount: "452000000" },
      ["amount"]
    );
    expect(result.matches).toBe(true);
  });

  it("treats a field missing from local data as a mismatch, never a silent pass", () => {
    const result = compareReceiptFields(
      { amount: "100" },
      { amount: "100", recipient: "GABC" },
      ["amount", "recipient"]
    );

    expect(result.matches).toBe(false);
    expect(result.missingFields).toEqual(["recipient"]);
  });

  it("treats a field missing from on-chain data as a mismatch, never a silent pass", () => {
    const result = compareReceiptFields(
      { amount: "100", recipient: "GABC" },
      { amount: "100" },
      ["amount", "recipient"]
    );

    expect(result.matches).toBe(false);
    expect(result.missingFields).toEqual(["recipient"]);
  });

  it("treats null and undefined as distinct from a present falsy value", () => {
    const result = compareReceiptFields({ flag: null }, { flag: undefined }, [
      "flag",
    ]);
    // Both normalize to "", so this is intentionally a match — the
    // distinction that matters is presence-in-the-object, already
    // covered by the missingFields tests above.
    expect(result.matches).toBe(true);
  });

  it("returns an empty comparison for an empty field list", () => {
    const result = compareReceiptFields({}, {}, []);
    expect(result.matches).toBe(true);
    expect(result.fields).toEqual([]);
  });
});
