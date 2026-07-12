import { describe, it, expect } from "vitest";
import { classifySubmissionFailure } from "./submissionFailure.js";

describe("classifySubmissionFailure", () => {
  it("classifies RPC/network errors as retryable", () => {
    const failure = classifySubmissionFailure(
      new Error("Submission failed: {\"status\":503,\"detail\":\"service unavailable\"}")
    );

    expect(failure).toEqual({
      code: "TX_RPC_TRANSIENT",
      message: expect.stringContaining("503"),
      retryable: true,
      txHash: undefined,
    });
  });

  it("classifies sequence conflicts as retryable", () => {
    const failure = classifySubmissionFailure(
      new Error("Submission failed: tx_bad_seq")
    );

    expect(failure.code).toBe("TX_SEQUENCE_CONFLICT");
    expect(failure.retryable).toBe(true);
  });

  it("classifies malformed XDR as terminal", () => {
    const failure = classifySubmissionFailure(
      new Error("Failed to parse XDR envelope")
    );

    expect(failure).toEqual({
      code: "TX_MALFORMED_XDR",
      message: "Failed to parse XDR envelope",
      retryable: false,
      txHash: undefined,
    });
  });

  it("classifies auth failures as terminal", () => {
    const failure = classifySubmissionFailure(
      new Error("Decryption failed: invalid auth tag")
    );

    expect(failure.code).toBe("TX_AUTH_FAILURE");
    expect(failure.retryable).toBe(false);
  });

  it("classifies simulation failures as terminal", () => {
    const failure = classifySubmissionFailure(
      new Error("Transaction simulation failed: {\"error\":\"op_underfunded\"}")
    );

    expect(failure).toEqual({
      code: "TX_SIMULATION_FAILED",
      message: expect.stringContaining("simulation failed"),
      retryable: false,
      txHash: undefined,
    });
  });

  it("classifies on-chain execution failures as terminal", () => {
    const txHash = "abc123";
    const failure = classifySubmissionFailure(
      new Error("Transaction failed: op_no_trust"),
      { txHash }
    );

    expect(failure).toEqual({
      code: "TX_EXECUTION_FAILED",
      message: "Transaction failed: op_no_trust",
      retryable: false,
      txHash,
    });
  });

  it("classifies poll timeouts as retryable", () => {
    const failure = classifySubmissionFailure(
      new Error("Transaction timeout or status untracked: PENDING")
    );

    expect(failure.code).toBe("TX_POLL_TIMEOUT");
    expect(failure.retryable).toBe(true);
  });

  it("classifies unknown errors as terminal by default", () => {
    const failure = classifySubmissionFailure(new Error("Unexpected wallet state"));

    expect(failure.code).toBe("TX_SUBMISSION_UNKNOWN");
    expect(failure.retryable).toBe(false);
  });
});
