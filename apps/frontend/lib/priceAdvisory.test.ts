import { describe, it, expect, beforeEach } from "vitest";
import {
  PRICE_ADVISORY_ACK_KEY,
  assessPriceAdvisory,
  readPriceAdvisoryAck,
  writePriceAdvisoryAck,
} from "./priceAdvisory";

const RANGE = { lowStroops: 4_000_000n, highStroops: 6_000_000n };

describe("assessPriceAdvisory", () => {
  it("returns null when the payload carries no hints (no strip)", () => {
    expect(
      assessPriceAdvisory([{ productId: "a", unitPriceStroops: 5n }], undefined)
    ).toBeNull();
    expect(
      assessPriceAdvisory([{ productId: "a", unitPriceStroops: 5n }], {})
    ).toBeNull();
  });

  it("is 'within' when every compared item sits inside its range", () => {
    const advisory = assessPriceAdvisory(
      [
        { productId: "a", unitPriceStroops: 5_000_000n },
        { productId: "b", unitPriceStroops: 4_000_000n },
      ],
      { a: RANGE, b: RANGE }
    );
    expect(advisory).toEqual({ level: "within", comparedCount: 2, aboveCount: 0 });
  });

  it("treats a price below the range low as still within (cheaper isn't a warning)", () => {
    const advisory = assessPriceAdvisory(
      [{ productId: "a", unitPriceStroops: 1_000_000n }],
      { a: RANGE }
    );
    expect(advisory?.level).toBe("within");
  });

  it("is 'above' when at least one item exceeds its range high", () => {
    const advisory = assessPriceAdvisory(
      [
        { productId: "a", unitPriceStroops: 5_000_000n },
        { productId: "b", unitPriceStroops: 9_000_000n },
      ],
      { a: RANGE, b: RANGE }
    );
    expect(advisory).toEqual({ level: "above", comparedCount: 2, aboveCount: 1 });
  });

  it("is 'no-data' when hints exist but none match the order's items", () => {
    const advisory = assessPriceAdvisory(
      [{ productId: "x", unitPriceStroops: 5_000_000n }],
      { a: RANGE }
    );
    expect(advisory).toEqual({ level: "no-data", comparedCount: 0, aboveCount: 0 });
  });

  it("coerces string/number unit prices and skips unparseable ones", () => {
    const advisory = assessPriceAdvisory(
      [
        { productId: "a", unitPriceStroops: "9000000" },
        { productId: "b", unitPriceStroops: "not-a-number" },
      ],
      { a: RANGE, b: RANGE }
    );
    expect(advisory).toEqual({ level: "above", comparedCount: 1, aboveCount: 1 });
  });
});

describe("price advisory acknowledgement (per session)", () => {
  beforeEach(() => window.sessionStorage.clear());

  it("defaults to not acknowledged", () => {
    expect(readPriceAdvisoryAck()).toBe(false);
  });

  it("remembers the acknowledgement once written", () => {
    writePriceAdvisoryAck();
    expect(readPriceAdvisoryAck()).toBe(true);
    expect(window.sessionStorage.getItem(PRICE_ADVISORY_ACK_KEY)).toBe("1");
  });
});
