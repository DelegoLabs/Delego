import { describe, it, expect } from "vitest";
import {
  isEmptyForecast,
  parseStroops,
  summarizeSpendForecast,
  type SpendForecastPoint,
} from "./spendForecast";

const LIMIT = "1000000000"; // 100 XLM

describe("parseStroops", () => {
  it("parses digit strings and rejects everything else", () => {
    expect(parseStroops("42")).toBe(42n);
    expect(parseStroops(undefined)).toBeNull();
    expect(parseStroops("-1")).toBeNull();
    expect(parseStroops("1.5")).toBeNull();
  });
});

describe("summarizeSpendForecast", () => {
  it("reports no breach when the projection stays under the limit", () => {
    const points: SpendForecastPoint[] = [
      { date: "Sep 01", historicalSpentStroops: "100000000", budgetLimitStroops: LIMIT },
      {
        date: "Sep 15",
        historicalSpentStroops: "400000000",
        projectedSpentStroops: "400000000",
        budgetLimitStroops: LIMIT,
      },
      { date: "Sep 30", projectedSpentStroops: "900000000", budgetLimitStroops: LIMIT },
    ];
    const summary = summarizeSpendForecast(points);
    expect(summary.spentToDateStroops).toBe(400000000n);
    expect(summary.projectedEndStroops).toBe(900000000n);
    expect(summary.budgetLimitStroops).toBe(1000000000n);
    expect(summary.projectedBreach).toBe(false);
    expect(summary.firstBreachDate).toBeNull();
  });

  it("flags the first projected point over the limit", () => {
    const points: SpendForecastPoint[] = [
      { date: "Sep 15", historicalSpentStroops: "600000000", budgetLimitStroops: LIMIT },
      { date: "Sep 22", projectedSpentStroops: "1100000000", budgetLimitStroops: LIMIT },
      { date: "Sep 30", projectedSpentStroops: "1500000000", budgetLimitStroops: LIMIT },
    ];
    const summary = summarizeSpendForecast(points);
    expect(summary.projectedBreach).toBe(true);
    expect(summary.firstBreachDate).toBe("Sep 22");
  });

  it("does not treat historical overspend as a projected breach", () => {
    const summary = summarizeSpendForecast([
      { date: "Sep 15", historicalSpentStroops: "2000000000", budgetLimitStroops: LIMIT },
    ]);
    expect(summary.projectedBreach).toBe(false);
  });
});

describe("isEmptyForecast", () => {
  it("is empty when no point has spend data", () => {
    expect(isEmptyForecast([])).toBe(true);
    expect(isEmptyForecast([{ date: "Sep 01", budgetLimitStroops: LIMIT }])).toBe(true);
    expect(
      isEmptyForecast([{ date: "Sep 01", projectedSpentStroops: "1", budgetLimitStroops: LIMIT }])
    ).toBe(false);
  });
});
