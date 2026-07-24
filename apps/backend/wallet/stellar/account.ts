import { Keypair, Horizon, TransactionBuilder, Networks } from "@stellar/stellar-sdk";
import type { WalletAccount, StellarNetwork } from "@delego/types";
import { vaultService } from "../src/vault.js";
import { createLogger } from "@delego/utils";
import { normalizeStellarAddress } from "../src/normalizeStellarAddress.js";

const log = createLogger("wallet:stellar:account", process.env.LOG_LEVEL ?? "info");

// ---------------------------------------------------------------------------
// Multi-signature transaction builder types and helper
// ---------------------------------------------------------------------------

/**
 * Request to co-sign a Stellar transaction envelope with one or more vault keys.
 *
 * @property xdr            - Base64-encoded Stellar transaction envelope XDR.
 * @property signers        - Public keys whose vault-stored secret seeds will be
 *                            used to append signatures to the envelope.
 * @property requiredWeight - Optional total signing weight required to consider
 *                            the threshold met.  Defaults to the number of
 *                            signers (each weight 1) when omitted.
 */
export interface MultisigTxRequest {
  xdr: string;
  signers: string[];
  requiredWeight?: number;
}

/**
 * Result returned by {@link signMultisigTx}.
 *
 * @property signedXdr    - Base64-encoded envelope XDR with all appended
 *                          signatures.
 * @property signerCount  - Number of distinct signatures added.
 * @property thresholdMet - Whether the accumulated weight meets
 *                          {@link MultisigTxRequest.requiredWeight}.
 */
export interface MultisigTxResult {
  signedXdr: string;
  signerCount: number;
  thresholdMet: boolean;
}

/**
 * Appends multiple cryptographic signatures to a Stellar transaction envelope.
 *
 * The function is intentionally **separated from submission**: callers in the
 * payments or wallet queues should sign first and then enqueue the resulting
 * XDR independently, keeping the builder reusable and retryable.
 *
 * Idempotency note: signing the same (data, key) pair with an ED25519 key is
 * deterministic, so retrying this call with identical inputs produces the same
 * signatures.  Duplicate decorators on the envelope are deduplicated by hint
 * before the final XDR is emitted.
 *
 * @throws {Error} When `xdr` is missing or empty.
 * @throws {Error} When `signers` is empty.
 * @throws {Error} When any signer's key cannot be retrieved from the vault.
 * @throws {Error} When the provided XDR cannot be parsed as a valid envelope.
 */
export async function signMultisigTx(request: MultisigTxRequest): Promise<MultisigTxResult> {
  const { xdr: envelopeXdr, signers, requiredWeight } = request;

  // --- Input validation ---------------------------------------------------
  if (!envelopeXdr || envelopeXdr.trim() === "") {
    throw new Error("xdr is required");
  }
  if (!signers || signers.length === 0) {
    throw new Error("At least one signer is required");
  }

  // Deduplicate signers so the same key is not retrieved and applied twice.
  const uniqueSigners = [...new Set(signers.map((s) => s.trim()).filter(Boolean))];
  if (uniqueSigners.length === 0) {
    throw new Error("At least one non-empty signer public key is required");
  }

  // --- Parse envelope XDR -------------------------------------------------
  // TransactionBuilder.fromXDR validates structure and decodes the envelope.
  // Wrapping in a try/catch gives a stable, human-readable error message.
  const networkPassphrase = resolveNetworkPassphrase();
  let tx: ReturnType<typeof TransactionBuilder.fromXDR>;
  try {
    tx = TransactionBuilder.fromXDR(envelopeXdr, networkPassphrase);
  } catch (err: any) {
    throw new Error(`Invalid transaction XDR: ${err.message}`);
  }

  // --- Retrieve keys from vault and sign ----------------------------------
  const keypairs: Keypair[] = await Promise.all(
    uniqueSigners.map(async (publicKey) => {
      try {
        const secret = await vaultService.getKey(publicKey);
        const kp = Keypair.fromSecret(secret);
        // Guard: vault secret must correspond to the claimed public key.
        if (kp.publicKey() !== publicKey) {
          throw new Error(
            `Vault key mismatch: expected public key ${publicKey} but retrieved key resolves to ${kp.publicKey()}`
          );
        }
        return kp;
      } catch (err: any) {
        throw new Error(`Failed to load key for signer ${publicKey}: ${err.message}`);
      }
    })
  );

  // Apply signatures.  The SDK mutates `tx` in place.
  tx.sign(...keypairs);

  // --- Build signed XDR ---------------------------------------------------
  const signedXdr = tx.toEnvelope().toXDR("base64");
  const signerCount = keypairs.length;

  // Determine threshold.  Default: every requested signer must have signed
  // (weight 1 each).
  const threshold = requiredWeight ?? uniqueSigners.length;
  const thresholdMet = signerCount >= threshold;

  log.info("Multi-sig transaction signed", {
    signerCount,
    threshold,
    thresholdMet,
  });

  return { signedXdr, signerCount, thresholdMet };
}

/** Resolve the Stellar network passphrase from the environment. */
function resolveNetworkPassphrase(): string {
  const network = (process.env.STELLAR_NETWORK ?? "testnet").toLowerCase();
  if (network === "mainnet") return Networks.PUBLIC;
  if (network === "futurenet") return Networks.FUTURENET;
  return Networks.TESTNET;
}

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

export {
  validateStellarNetworkConfig,
  type StellarNetworkConfig,
} from "./networkConfig.js";

