import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { parseBigIntString } from "@delego/utils";

describe("parseBigIntString", () => {
  it("parses valid non-negative integer strings", () => {
    const result = parseBigIntString("10000000");
    assert.equal(result.valid, true);
    assert.equal(result.value, 10_000_000n);
  });

  it("parses zero by default", () => {
    const result = parseBigIntString("0");
    assert.equal(result.valid, true);
    assert.equal(result.value, 0n);
  });

  it("rejects decimal strings", () => {
    const result = parseBigIntString("1.5");
    assert.equal(result.valid, false);
    assert.equal(result.error, "invalid_format");
  });

  it("rejects negative values by default", () => {
    const result = parseBigIntString("-1");
    assert.equal(result.valid, false);
    assert.equal(result.error, "invalid_format");
  });

  it("rejects unsafe number inputs", () => {
    const result = parseBigIntString(123);
    assert.equal(result.valid, false);
    assert.equal(result.error, "invalid_type");
  });

  it("rejects values above max boundary", () => {
    const result = parseBigIntString("100", { max: 50n });
    assert.equal(result.valid, false);
    assert.equal(result.error, "exceeds_max");
  });
});
