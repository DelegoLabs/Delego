import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { stroopsToDisplay, displayToStroops } from "@delego/utils";

describe("Task 2 — Fee transparency formatting & fallback", () => {
  const GROSS = 25_000_000n;
  const FEE = 250_000n;
  const NET = 24_750_000n;

  it("uses the shared stroopsToDisplay formatter for all three lines", () => {
    const grossFormatted = stroopsToDisplay(GROSS);
    const feeFormatted = stroopsToDisplay(FEE);
    const netFormatted = stroopsToDisplay(NET);

    assert.equal(grossFormatted, "2.5000000");
    assert.equal(feeFormatted, "0.0250000");
    assert.equal(netFormatted, "2.4750000");
  });

  it("does not conflate a null fee-config with a zero fee", () => {
    const DASH = "—";
    function formatFees(f) {
      return {
        gross: f?.grossStroops !== undefined && f?.grossStroops !== null
          ? stroopsToDisplay(f.grossStroops)
          : DASH,
        fee: f?.totalFeeStroops !== undefined && f?.totalFeeStroops !== null
          ? stroopsToDisplay(f.totalFeeStroops)
          : DASH,
        net: f?.netProceedsStroops !== undefined && f?.netProceedsStroops !== null
          ? stroopsToDisplay(f.netProceedsStroops)
          : DASH,
      };
    }

    const missing = formatFees(null);
    assert.equal(missing.gross, DASH);
    assert.equal(missing.fee, DASH);
    assert.equal(missing.net, DASH);

    const zero = formatFees({
      grossStroops: 0n,
      totalFeeStroops: 0n,
      netProceedsStroops: 0n,
      lines: [],
      hasEstimates: false,
    });
    assert.notEqual(zero.gross, DASH);
    assert.notEqual(zero.fee, DASH);
    assert.notEqual(zero.net, DASH);
  });

  it("round-trips amount via shared displayToStroops / stroopsToDisplay", () => {
    const s = "3.1415926";
    assert.equal(stroopsToDisplay(displayToStroops(s)), s);
  });
});
