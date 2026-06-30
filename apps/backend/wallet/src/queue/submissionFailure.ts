/** Structured result from classifying a transaction submission failure. */
export interface SubmissionFailure {
  code: string;
  message: string;
  retryable: boolean;
  txHash?: string;
}

const MALFORMED_XDR_PATTERNS = [
  "malformed xdr",
  "invalid xdr",
  "failed to parse xdr",
  "fromxdr",
  "xdr decode",
  "bad xdr",
] as const;

const AUTH_FAILURE_PATTERNS = [
  "auth failure",
  "authentication failed",
  "unauthorized",
  "forbidden",
  "access denied",
  "invalid auth tag",
  "decryption failed",
  "failed to decrypt",
] as const;

const RETRYABLE_NETWORK_PATTERNS = [
  "timeout",
  "network",
  "econnrefused",
  "enotfound",
  "econnreset",
  "etimedout",
  "socket hang up",
  "fetch failed",
  "rate limit",
  "429",
  "500",
  "502",
  "503",
  "504",
  "temporarily unavailable",
  "service unavailable",
] as const;

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

function matchesPatterns(message: string, patterns: readonly string[]): boolean {
  const lower = message.toLowerCase();
  return patterns.some((pattern) => lower.includes(pattern));
}

/**
 * Maps thrown submission errors to retryable or terminal failures before BullMQ
 * requeues a job. Retryable codes (network/RPC faults, sequence conflicts, poll
 * timeouts) are rethrown as standard errors; terminal codes use UnrecoverableError.
 */
export function classifySubmissionFailure(
  err: unknown,
  context?: { txHash?: string }
): SubmissionFailure {
  const message = getErrorMessage(err);
  const lower = message.toLowerCase();
  const txHash = context?.txHash;

  if (matchesPatterns(lower, MALFORMED_XDR_PATTERNS)) {
    return { code: "TX_MALFORMED_XDR", message, retryable: false, txHash };
  }

  if (matchesPatterns(lower, AUTH_FAILURE_PATTERNS)) {
    return { code: "TX_AUTH_FAILURE", message, retryable: false, txHash };
  }

  if (lower.includes("simulation failed")) {
    return { code: "TX_SIMULATION_FAILED", message, retryable: false, txHash };
  }

  if (lower.includes("tx_bad_seq") || lower.includes("bad_seq")) {
    return { code: "TX_SEQUENCE_CONFLICT", message, retryable: true, txHash };
  }

  if (lower.includes("transaction failed")) {
    return { code: "TX_EXECUTION_FAILED", message, retryable: false, txHash };
  }

  if (lower.includes("submission failed")) {
    if (matchesPatterns(lower, RETRYABLE_NETWORK_PATTERNS)) {
      return { code: "TX_RPC_TRANSIENT", message, retryable: true, txHash };
    }
    return { code: "TX_SUBMISSION_REJECTED", message, retryable: false, txHash };
  }

  if (lower.includes("transaction timeout") || lower.includes("status untracked")) {
    return { code: "TX_POLL_TIMEOUT", message, retryable: true, txHash };
  }

  if (matchesPatterns(lower, RETRYABLE_NETWORK_PATTERNS)) {
    return { code: "TX_RPC_TRANSIENT", message, retryable: true, txHash };
  }

  return { code: "TX_SUBMISSION_UNKNOWN", message, retryable: false, txHash };
}
