/**
 * Wallet adapter error handling (#743).
 *
 * The Stellar browser extensions (Freighter, Albedo, Lobstr) reject signing
 * requests with a generic error when the user dismisses the popup. That
 * rejection is not a failure the user needs to see an error banner for, so it
 * is normalized here into a small, typed set of outcomes. Callers can then
 * show a neutral "Transaction cancelled by user" notice instead of an alert,
 * and reset their loading state.
 */

export type WalletErrorType =
  | "user_declined"
  | "wallet_locked"
  | "insufficient_fee"
  | "network_error"
  | "unknown";

export interface WalletErrorDetails {
  code: WalletErrorType;
  message: string;
  walletName: string;
}

/** Freighter's code for a user-dismissed signature/connection request. */
export const USER_DECLINED_CODE = -4;

/** Neutral notice shown when the user cancels in their wallet. */
export const WALLET_CANCELLED_MESSAGE = "Transaction cancelled by user";

/** Raised for any wallet-adapter failure, carrying its normalized details. */
export class WalletActionError extends Error {
  readonly code: WalletErrorType;
  readonly walletName: string;

  constructor(details: WalletErrorDetails) {
    super(details.message);
    this.name = "WalletActionError";
    this.code = details.code;
    this.walletName = details.walletName;
  }
}

interface RawWalletError {
  code?: unknown;
  message?: unknown;
}

/** Pulls `{ code, message }` out of the many shapes wallet adapters use. */
function rawFrom(error: unknown): RawWalletError {
  if (typeof error === "string") return { message: error };
  if (error && typeof error === "object") {
    const candidate = error as RawWalletError & { error?: unknown };
    if (candidate.error && typeof candidate.error === "object") {
      return candidate.error as RawWalletError;
    }
    return candidate;
  }
  return {};
}

function isDeclineSignal(code: number | undefined, message: string): boolean {
  if (code === USER_DECLINED_CODE) return true;
  // "The network rejected the transaction" is a submit failure, not a user
  // cancellation, so guard against classifying it as a decline.
  if (/network\s+rejected/i.test(message)) return false;
  return (
    /declin/i.test(message) ||
    /user\s+(rejected|denied|cancell?ed)/i.test(message) ||
    /rejected\s+by\s+user/i.test(message) ||
    /cancell?ed\s+by\s+user/i.test(message) ||
    /signature.*(cancell?ed|rejected|declined)/i.test(message)
  );
}

/** Normalizes any wallet-adapter error into `WalletErrorDetails`. */
export function classifyWalletError(
  error: unknown,
  walletName = "Freighter"
): WalletErrorDetails {
  const raw = rawFrom(error);
  const code = typeof raw.code === "number" ? raw.code : undefined;
  const message =
    typeof raw.message === "string" && raw.message.trim().length > 0
      ? raw.message
      : "The wallet request could not be completed.";

  let type: WalletErrorType = "unknown";
  if (isDeclineSignal(code, message)) {
    type = "user_declined";
  } else if (/lock|unlock|password|passphrase/i.test(message)) {
    type = "wallet_locked";
  } else if (/insufficient|balance|fee/i.test(message)) {
    type = "insufficient_fee";
  } else if (/network|timed?\s*out|timeout|fetch|connection|offline/i.test(message)) {
    type = "network_error";
  }

  return { code: type, message, walletName };
}

/** True when the wallet failure was the user dismissing the request. */
export function isUserDeclined(error: unknown): boolean {
  return classifyWalletError(error).code === "user_declined";
}
