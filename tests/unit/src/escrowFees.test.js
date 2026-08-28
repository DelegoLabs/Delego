import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { computeFeeBreakdown, deriveIneligibilityReasons } from "../../../apps/backend/gateway/dist/routes/escrow.js";

describe("computeFeeBreakdown", () => {
  it("renders null (never '0') for fee/net when there is no fee config at all", () => {
    const result = computeFeeBreakdown(10_000_000n, null);
    assert.equal(result.grossStroops, "10000000");
    assert.equal(result.feeStroops, null);
    assert.equal(result.netStroops, null);
    assert.equal(result.feeBasisPoints, null);
    assert.equal(result.isEstimated, false);
    assert.deepEqual(result.treasuries, []);
  });

  it("marks the fee as estimated (and still omits fee/net) when the config is dynamic", () => {
    const result = computeFeeBreakdown(10_000_000n, {
      feeBasisPoints: null,
      isDynamic: true,
      treasuries: [{ name: "Platform", address: "GPLATFORM", splitBasisPoints: 10000 }],
    });
    assert.equal(result.isEstimated, true);
    assert.equal(result.feeStroops, null);
    assert.equal(result.netStroops, null);
    assert.deepEqual(result.treasuries, []);
  });

  it("computes exact fee/net and per-treasury splits for a static basis-point fee", () => {
    const result = computeFeeBreakdown(10_000_000n, {
      feeBasisPoints: 250, // 2.5%
      isDynamic: false,
      treasuries: [
        { name: "Platform", address: "GPLATFORM", splitBasisPoints: 8000 },
        { name: "Referral pool", address: "GREFERRAL", splitBasisPoints: 2000 },
      ],
    });

    assert.equal(result.feeBasisPoints, 250);
    assert.equal(result.isEstimated, false);
    assert.equal(result.feeStroops, "250000"); // 2.5% of 10,000,000
    assert.equal(result.netStroops, "9750000");
    assert.equal(result.treasuries.length, 2);
    assert.equal(result.treasuries[0].amountStroops, "200000"); // 80% of the 250,000 fee
    assert.equal(result.treasuries[1].amountStroops, "50000"); // 20% of the 250,000 fee
  });

  it("rounds fee/split amounts down (floor) rather than overcharging", () => {
    // 1 stroop at 1bp: 1 * 1 / 10000 = 0 (floor), not a fractional stroop
    const result = computeFeeBreakdown(1n, { feeBasisPoints: 1, isDynamic: false, treasuries: [] });
    assert.equal(result.feeStroops, "0");
    assert.equal(result.netStroops, "1");
  });
});

describe("deriveIneligibilityReasons", () => {
  it("returns no reasons when eligible", () => {
    const reasons = deriveIneligibilityReasons({
      isAuthorizedCaller: true,
      alreadyReleased: false,
      invalidStatus: false,
    });
    assert.deepEqual(reasons, []);
  });

  it("flags unauthorized_caller independently of status", () => {
    const reasons = deriveIneligibilityReasons({
      isAuthorizedCaller: false,
      alreadyReleased: false,
      invalidStatus: false,
    });
    assert.deepEqual(reasons, ["unauthorized_caller"]);
  });

  it("flags already_released but not invalid_status for a released escrow (avoids a redundant reason)", () => {
    // Released is neither Active nor Disputed, so invalidStatus is also true here — the derivation
    // should collapse that into the more specific already_released reason, not report both.
    const reasons = deriveIneligibilityReasons({
      isAuthorizedCaller: true,
      alreadyReleased: true,
      invalidStatus: true,
    });
    assert.deepEqual(reasons, ["already_released"]);
  });

  it("flags invalid_status for a refunded escrow", () => {
    const reasons = deriveIneligibilityReasons({
      isAuthorizedCaller: true,
      alreadyReleased: false,
      invalidStatus: true,
    });
    assert.deepEqual(reasons, ["invalid_status"]);
  });

  it("can report multiple reasons at once", () => {
    const reasons = deriveIneligibilityReasons({
      isAuthorizedCaller: false,
      alreadyReleased: false,
      invalidStatus: true,
    });
    assert.deepEqual(reasons, ["unauthorized_caller", "invalid_status"]);
  });
});
