import type { IncomingMessage, ServerResponse } from "node:http";
import { json } from "@delego/utils";
import { extractAuth } from "../middleware/auth.js";
import { requireWalletOwnership } from "../middleware/walletOwnership.js";
import { Wallet } from "../src/models/index.js";

/** GET /api/v1/wallets/:walletId — wallet-scoped route protected by ownership guard. */
export async function getWalletHandler(
  req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>
): Promise<void> {
  const { walletId } = params;
  if (!(await requireWalletOwnership(req, res, walletId))) {
    return;
  }

  const wallet = await Wallet.findByPk(walletId);
  if (!wallet) {
    return;
  }

  const auth = extractAuth(req);
  json(res, 200, {
    data: {
      id: wallet.id,
      userId: auth.userId,
      stellarAddress: wallet.stellarAddress,
      publicKey: wallet.publicKey,
      network: wallet.network,
      createdAt: wallet.createdAt.toISOString(),
      updatedAt: wallet.updatedAt.toISOString(),
    },
    error: null,
  });
}
