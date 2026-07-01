import { Keypair, Horizon, Networks, TransactionBuilder } from "@stellar/stellar-sdk";
import type { WalletAccount, StellarNetwork } from "@delego/types";
import { vaultService } from "../src/vault.js";
import { createLogger } from "@delego/utils";
import { normalizeStellarAddress } from "../src/normalizeStellarAddress.js";

const log = createLogger("wallet:stellar:account", process.env.LOG_LEVEL ?? "info");

export interface AccountService {
  getAccount(address: string): Promise<WalletAccount | null>;
  createAccount(network: StellarNetwork): Promise<WalletAccount & { secret?: string }>;
}

export interface MultisigTxRequest {
  xdr: string;
  signerKeyIds?: string[];
  /** @deprecated Use signerKeyIds. Signer IDs are vault-managed Stellar public keys. */
  signers?: string[];
  requiredWeight?: number;
}

export interface MultisigTxResult {
  signedXdr: string;
  signerCount: number;
  thresholdMet: boolean;
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

function getNetworkPassphrase(): string {
  const network = ((process.env.STELLAR_NETWORK as StellarNetwork | undefined) ?? "testnet").toLowerCase();
  if (network === "mainnet") {
    return Networks.PUBLIC;
  }
  if (network === "futurenet") {
    return Networks.FUTURENET;
  }
  return Networks.TESTNET;
}

function getRequestedSignerIds(request: MultisigTxRequest): string[] {
  const rawSignerIds = request.signerKeyIds?.length ? request.signerKeyIds : request.signers ?? [];
  const signerIds: string[] = [];
  const seen = new Set<string>();

  for (const rawSignerId of rawSignerIds) {
    const signerId = rawSignerId.trim();
    if (!signerId || seen.has(signerId)) {
      continue;
    }

    try {
      Keypair.fromPublicKey(signerId);
    } catch {
      throw new Error(`Invalid signer key id: ${signerId}`);
    }

    seen.add(signerId);
    signerIds.push(signerId);
  }

  if (signerIds.length === 0) {
    throw new Error("At least one signer key id is required");
  }

  return signerIds;
}

function getRequiredWeight(request: MultisigTxRequest, signerCount: number): number {
  const requiredWeight = request.requiredWeight ?? signerCount;
  if (!Number.isInteger(requiredWeight) || requiredWeight < 1) {
    throw new Error("requiredWeight must be a positive integer");
  }
  if (requiredWeight > signerCount) {
    throw new Error(`Multisig threshold cannot be met with ${signerCount} signer(s)`);
  }
  return requiredWeight;
}

type SignableTransaction = ReturnType<typeof TransactionBuilder.fromXDR>;

function hasValidSignature(tx: SignableTransaction, signer: Keypair): boolean {
  const txHash = tx.hash();
  const signerHint = signer.signatureHint();

  return tx.signatures.some((signature) => (
    Buffer.compare(signature.hint(), signerHint) === 0
      && signer.verify(txHash, signature.signature())
  ));
}

async function loadSignerKeypair(signerKeyId: string): Promise<Keypair> {
  const secret = await vaultService.getKey(signerKeyId);
  const keypair = Keypair.fromSecret(secret);

  if (keypair.publicKey() !== signerKeyId) {
    throw new Error(`Vault secret does not match signer key id: ${signerKeyId}`);
  }

  return keypair;
}

/**
 * Appends vault-backed Stellar signatures to a transaction envelope without submitting it.
 * Each signer ID is a vault-managed public key stored through {@link vaultService}.
 */
export async function signMultisigTx(request: MultisigTxRequest): Promise<MultisigTxResult> {
  if (!request.xdr || request.xdr.trim() === "") {
    throw new Error("Transaction XDR is required");
  }

  const signerIds = getRequestedSignerIds(request);
  const requiredWeight = getRequiredWeight(request, signerIds.length);
  const tx = TransactionBuilder.fromXDR(request.xdr, getNetworkPassphrase());
  const signerKeypairs = await Promise.all(signerIds.map((signerId) => loadSignerKeypair(signerId)));

  for (const signerKeypair of signerKeypairs) {
    if (!hasValidSignature(tx, signerKeypair)) {
      tx.sign(signerKeypair);
    }
  }

  const signerCount = signerKeypairs.filter((signerKeypair) => hasValidSignature(tx, signerKeypair)).length;
  const thresholdMet = signerCount >= requiredWeight;
  if (!thresholdMet) {
    throw new Error(`Multisig threshold not met: ${signerCount}/${requiredWeight}`);
  }

  return {
    signedXdr: tx.toEnvelope().toXDR("base64"),
    signerCount,
    thresholdMet,
  };
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
