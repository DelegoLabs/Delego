import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parsePaginationQuery } from "../../../apps/backend/gateway/dist/src/pagination.js";

describe("Gateway Pagination Parser", () => {
  it("applies defaults when no query params are given", () => {
    const result = parsePaginationQuery(new URLSearchParams(""));
    assert.equal(result.ok, true);
    assert.deepEqual(result.value, { limit: 20, cursor: undefined, sort: "desc" });
  });

  it("clamps limit to the safe maximum", () => {
    const result = parsePaginationQuery(new URLSearchParams("limit=5000"));
    assert.equal(result.ok, true);
    assert.equal(result.value.limit, 100);
  });

  it("accepts a limit at the boundary", () => {
    const result = parsePaginationQuery(new URLSearchParams("limit=100"));
    assert.equal(result.ok, true);
    assert.equal(result.value.limit, 100);
  });

  it("rejects a non-numeric limit", () => {
    const result = parsePaginationQuery(new URLSearchParams("limit=abc"));
    assert.equal(result.ok, false);
    assert.equal(result.error.field, "limit");
  });

  it("rejects a zero or negative limit", () => {
    const result = parsePaginationQuery(new URLSearchParams("limit=0"));
    assert.equal(result.ok, false);
    assert.equal(result.error.field, "limit");
  });

  it("rejects an invalid sort value", () => {
    const result = parsePaginationQuery(new URLSearchParams("sort=newest"));
    assert.equal(result.ok, false);
    assert.equal(result.error.field, "sort");
  });

  it("accepts a valid sort value", () => {
    const result = parsePaginationQuery(new URLSearchParams("sort=asc"));
    assert.equal(result.ok, true);
    assert.equal(result.value.sort, "asc");
  });

  it("rejects a malformed cursor", () => {
    const result = parsePaginationQuery(new URLSearchParams("cursor=" + encodeURIComponent("not a cursor!")));
    assert.equal(result.ok, false);
    assert.equal(result.error.field, "cursor");
  });

  it("accepts a well-formed cursor", () => {
    const result = parsePaginationQuery(new URLSearchParams("cursor=a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d"));
    assert.equal(result.ok, true);
    assert.equal(result.value.cursor, "a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d");
  });
});
