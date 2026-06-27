import { Keypair, Horizon } from "@stellar/stellar-sdk";
import type { WalletAccount, StellarNetwork } from "@delego/types";
import { vaultService } from "../src/vault.js";
import { resolveAndValidateStellarConfig } from "../src/stellarConfig.js";
import { createLogger } from "@delego/utils";

const log = createLogger("wallet:stellar:account", process.env.LOG_LEVEL ?? "info");

export interface AccountService {
  getAccount(address: string): Promise<WalletAccount | null>;
  createAccount(network: StellarNetwork): Promise<WalletAccount & { secret?: string }>;
}

export const accountService: AccountService = {
  async getAccount(address: string): Promise<WalletAccount | null> {
    // For now, let's check if we manage this account in our vault.
    try {
      const publicKeys = await vaultService.listPublicKeys();
      if (!publicKeys.includes(address)) {
        log.warn("Account requested is not managed in local vault", { address });
      }

      // Use the same validated config as `index.ts` at startup. The Horizon URL
      // already incorporates any STELLAR_HORIZON_URL override.
      const config = resolveAndValidateStellarConfig();
      const networkName: StellarNetwork =
        config.network === "custom" ? "testnet" : (config.network as StellarNetwork);
      const server = new Horizon.Server(config.horizonUrl);

      try {
        await server.loadAccount(address);
        return { address, network: networkName };
      } catch (err: any) {
        if (err.response?.status === 404) {
          log.warn("Account not found on-chain", { address });
          return null;
        }
        throw err;
      }
    } catch (err: any) {
      log.error("Failed to get account details", { address, error: err.message });
      throw err;
    }
  },

  async createAccount(network: StellarNetwork): Promise<WalletAccount & { secret?: string }> {
    try {
      log.info("Generating new Stellar account keypair...", { network });
      const pair = Keypair.random();
      const address = pair.publicKey();
      const secret = pair.secret();

      // Store securely in VaultService
      await vaultService.storeKey(address, secret);

      // If testnet, fund using Friendbot
      if (network === "testnet") {
        log.info("Funding testnet account via Friendbot...", { address });
        const friendbotUrl = `https://friendbot.stellar.org?addr=${encodeURIComponent(address)}`;
        const res = await fetch(friendbotUrl);
        if (!res.ok) {
          const body = await res.text();
          throw new Error(`Friendbot funding failed with status ${res.status}: ${body}`);
        }
        log.info("Account funded successfully via Friendbot", { address });
      } else if (network === "futurenet") {
        log.info("Funding futurenet account via Friendbot...", { address });
        const friendbotUrl = `https://friendbot-futurenet.stellar.org?addr=${encodeURIComponent(address)}`;
        const res = await fetch(friendbotUrl);
        if (!res.ok) {
          const body = await res.text();
          throw new Error(`Futurenet Friendbot funding failed with status ${res.status}: ${body}`);
        }
        log.info("Account funded successfully via Futurenet Friendbot", { address });
      } else {
        log.warn("Account generated for mainnet. Please fund it manually.", { address });
      }

      return {
        address,
        network,
        // Only return secret if requested or log in development environments.
        secret: process.env.NODE_ENV === "development" ? secret : undefined
      };
    } catch (err: any) {
      log.error("Failed to create Stellar account", { error: err.message });
      throw err;
    }
  },
};
