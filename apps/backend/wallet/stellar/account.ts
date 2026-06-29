import { Keypair, Horizon } from "@stellar/stellar-sdk";
import type { WalletAccount, StellarNetwork } from "@delego/types";
import { vaultService } from "../src/vault.js";
import { createLogger } from "@delego/utils";
import { normalizeStellarAddress } from "../src/normalizeStellarAddress.js";

const log = createLogger("wallet:stellar:account", process.env.LOG_LEVEL ?? "info");

export interface AccountService {
  getAccount(address: string): Promise<WalletAccount | null>;
  createAccount(network: StellarNetwork): Promise<WalletAccount & { secret?: string }>;
}

function getHorizonUrl(network: StellarNetwork): string {
  if (network === "mainnet") {
    return process.env.STELLAR_HORIZON_URL ?? "https://horizon.stellar.org";
  } else if (network === "futurenet") {
    return process.env.STELLAR_HORIZON_URL ?? "https://horizon-futurenet.stellar.org";
  } else {
    return process.env.STELLAR_HORIZON_URL ?? "https://horizon-testnet.stellar.org";
  }
}

export const accountService: AccountService = {
  async getAccount(address: string): Promise<WalletAccount | null> {
    const { original, normalized, valid } = normalizeStellarAddress(address);
    if (!valid) {
      throw new Error("Invalid Stellar public key address");
    }

    // For now, let's check if we manage this account in our vault.
    try {
      const publicKeys = await vaultService.listPublicKeys();
      if (!publicKeys.includes(normalized)) {
        log.warn("Account requested is not managed in local vault", { address: normalized, original });
      }

      // Check if it exists on-chain via Horizon
      const network: StellarNetwork = (process.env.STELLAR_NETWORK as StellarNetwork) ?? "testnet";
      const horizonUrl = getHorizonUrl(network);
      const server = new Horizon.Server(horizonUrl);
      
      try {
        await server.loadAccount(normalized);
        return { address: normalized, network };
      } catch (err: any) {
        if (err.response?.status === 404) {
          log.warn("Account not found on-chain", { address: normalized });
          return null;
        }
        throw err;
      }
    } catch (err: any) {
      log.error("Failed to get account details", { address: normalized, error: err.message });
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
