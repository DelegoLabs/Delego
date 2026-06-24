import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mapSimulationResult } from "../../../apps/backend/wallet/dist/src/sorobanSimulator.js";

function makeSuccessResponse(overrides = {}) {
  return {
    latestLedger: 1000,
    minResourceFee: "100",
    transactionData: null,
    events: [],
    results: [{ auth: [], xdr: "AAA=" }],
    ...overrides,
  };
}

function makeErrorResponse(error = "simulation failed") {
  return {
    latestLedger: 1000,
    error,
  };
}

describe("mapSimulationResult", () => {
  it("returns success: true with minResourceFee for a success response", () => {
    const response = makeSuccessResponse({ minResourceFee: "500" });
    const result = mapSimulationResult(response);
    assert.equal(result.success, true);
    assert.equal(result.minResourceFee, "500");
    assert.equal(result.error, undefined);
  });

  it("returns success: false with error for an error response", () => {
    const response = makeErrorResponse("contract execution reverted");
    const result = mapSimulationResult(response);
    assert.equal(result.success, false);
    assert.equal(result.error, "contract execution reverted");
    assert.equal(result.minResourceFee, undefined);
    assert.equal(result.footprint, undefined);
  });

  it("returns success: false with generic error for unknown response shape", () => {
    const response = { latestLedger: 1000 };
    const result = mapSimulationResult(response);
    assert.equal(result.success, false);
    assert.ok(result.error);
  });

  it("omits minResourceFee when not present in success response", () => {
    const response = makeSuccessResponse({ minResourceFee: undefined });
    const result = mapSimulationResult(response);
    assert.equal(result.success, true);
    assert.equal(result.minResourceFee, undefined);
  });

  it("omits footprint when transactionData is null", () => {
    const response = makeSuccessResponse({ transactionData: null });
    const result = mapSimulationResult(response);
    assert.equal(result.success, true);
    assert.equal(result.footprint, undefined);
  });

  it("extracts footprint as base64 XDR when transactionData is present", () => {
    const xdrBytes = Buffer.from("footprint-xdr");
    const response = makeSuccessResponse({
      transactionData: {
        build() {
          return { toXDR: () => xdrBytes };
        },
      },
    });
    const result = mapSimulationResult(response);
    assert.equal(result.success, true);
    assert.equal(result.footprint, xdrBytes.toString("base64"));
  });
});
