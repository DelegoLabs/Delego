import type { IncomingMessage, ServerResponse } from "node:http";
import { Wallet } from "../src/models/index.js";
import { extractAuth } from "./auth.js";
import { notFound, sendApiError, unauthorized } from "../src/errors.js";

/** Issue #191 — Result of a wallet ownership lookup. */
export interface WalletOwnershipCheck {
  userId: string;
  walletId: string;
  owned: boolean;
}

/**
 * Loads wallet ownership from the gateway Wallet model.
 * Returns `owned: false` when the wallet does not exist or belongs to another user.
 */
export async function checkWalletOwnership(
  userId: string,
  walletId: string
): Promise<WalletOwnershipCheck> {
  const wallet = await Wallet.findByPk(walletId);
  if (!wallet) {
    return { userId, walletId, owned: false };
  }

  return {
    userId,
    walletId,
    owned: wallet.userId === userId,
  };
}

/**
 * Reusable guard for wallet-scoped route handlers.
 * Sends 401/404/403 responses and returns false when the handler should not continue.
 */
export async function requireWalletOwnership(
  req: IncomingMessage,
  res: ServerResponse,
  walletId: string
): Promise<boolean> {
  const auth = extractAuth(req);
  if (!auth.userId) {
    unauthorized(res, "Authentication required", req);
    return false;
  }

  const wallet = await Wallet.findByPk(walletId);
  if (!wallet) {
    notFound(res, "Wallet not found", req);
    return false;
  }

  if (wallet.userId !== auth.userId) {
    sendApiError(res, 403, "AUTHORIZATION_ERROR", "You do not own this wallet", req);
    return false;
  }

  return true;
}
