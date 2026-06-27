import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseIsoDate } from "@delego/utils";

describe("parseIsoDate", () => {
  it("parses valid ISO-8601 date-time strings", () => {
    const result = parseIsoDate("2026-06-27T12:00:00.000Z");
    assert.equal(result.valid, true);
    assert.ok(result.date instanceof Date);
    assert.equal(result.date?.toISOString(), "2026-06-27T12:00:00.000Z");
  });

  it("rejects date-only strings", () => {
    const result = parseIsoDate("2026-06-27");
    assert.equal(result.valid, false);
    assert.equal(result.error, "invalid_format");
  });

  it("rejects malformed strings", () => {
    const result = parseIsoDate("not-a-date");
    assert.equal(result.valid, false);
    assert.equal(result.error, "invalid_format");
  });

  it("rejects future dates when configured", () => {
    const result = parseIsoDate("2099-01-01T00:00:00.000Z", { rejectFuture: true });
    assert.equal(result.valid, false);
    assert.equal(result.error, "future_not_allowed");
  });

  it("rejects past dates when configured", () => {
    const result = parseIsoDate("2000-01-01T00:00:00.000Z", { rejectPast: true });
    assert.equal(result.valid, false);
    assert.equal(result.error, "past_not_allowed");
  });
});
