import { describe, it, expect } from "vitest";
import {
  formatStroopsToXlm,
  parseSimulationResponse,
} from "./sorobanSimulation";

describe("sorobanSimulation module", () => {
  describe("formatStroopsToXlm", () => {
    it("converts Stroops string to formatted XLM string without precision loss", () => {
      expect(formatStroopsToXlm("10000000")).toBe("1 XLM");
      expect(formatStroopsToXlm("12500000")).toBe("1.25 XLM");
      expect(formatStroopsToXlm("100")).toBe("0.00001 XLM");
    });
  });

  describe("parseSimulationResponse", () => {
    it("handles error simulation response", () => {
      const mockErrResponse: any = {
        error: "Contract host function panicked.",
      };
      const result = parseSimulationResponse(mockErrResponse);

      expect(result.metrics.isSimulatedSuccessfully).toBe(false);
      expect(result.error).toBe("Contract host function panicked.");
    });

    it("parses metrics and produces CPU warning when exceeding 80% threshold", () => {
      const mockSuccessResponse: any = {
        minResourceFee: "5000",
        transactionData: {
          build: () => ({
            resources: () => ({
              instructions: 85_000_000,
              readBytes: 10_000,
              writeBytes: 5_000,
            }),
          }),
          toXDR: () => "BASE64XDR",
        },
      };

      const result = parseSimulationResponse(mockSuccessResponse);

      expect(result.metrics.isSimulatedSuccessfully).toBe(true);
      expect(result.metrics.cpuInstructions).toBe(85_000_000);
      expect(result.metrics.minResourceFeeStroops).toBe("5000");
      expect(result.warnings.length).toBe(1);
      expect(result.warnings[0]).toContain("85.0% of maximum limit");
    });
  });
});
