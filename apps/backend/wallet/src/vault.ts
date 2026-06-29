import * as crypto from "node:crypto";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { createLogger } from "@delego/utils";

const log = createLogger("wallet:vault", process.env.LOG_LEVEL ?? "info");

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const SALT_LENGTH = 16;
const KEY_LENGTH = 32;
const ITERATIONS = 10000;

export class VaultService {
  private masterSecret: string;
  private vaultData: Record<
    string,
    { iv: string; tag: string; encryptedData: string; salt: string; keyVersion: string }
  > = {};

  constructor() {
    this.masterSecret = process.env.WALLET_MASTER_SECRET ?? "default-dev-wallet-master-secret-key-32-chars";
  }

  private async getEncryptionKey(salt: Buffer): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      crypto.pbkdf2(
        this.masterSecret,
        salt,
        ITERATIONS,
        KEY_LENGTH,
        "sha256",
        (err, derivedKey) => {
          if (err) reject(err);
          else resolve(derivedKey);
        }
      );
    });
  }

  private getVaultPath(): string {
    return process.env.VAULT_FILE_PATH ?? path.join(process.cwd(), "data", "vault.json");
  }

  private async loadVault(): Promise<void> {
    try {
      const vaultPath = this.getVaultPath();
      await fs.mkdir(path.dirname(vaultPath), { recursive: true });
      const data = await fs.readFile(vaultPath, "utf-8");
      this.vaultData = JSON.parse(data);
    } catch (err: any) {
      if (err.code === "ENOENT") {
        this.vaultData = {};
      } else {
        log.error("Failed to load vault data", { error: err.message });
        throw err;
      }
    }
  }

  private async saveVault(): Promise<void> {
    try {
      const vaultPath = this.getVaultPath();
      await fs.mkdir(path.dirname(vaultPath), { recursive: true });
      await fs.writeFile(vaultPath, JSON.stringify(this.vaultData, null, 2), "utf-8");
    } catch (err: any) {
      log.error("Failed to save vault data", { error: err.message });
      throw err;
    }
  }

  public async storeKey(publicKey: string, secretKey: string): Promise<void> {
    await this.loadVault();

    const salt = crypto.randomBytes(SALT_LENGTH);
    const iv = crypto.randomBytes(IV_LENGTH);
    const key = await this.getEncryptionKey(salt);

    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    let encrypted = cipher.update(secretKey, "utf8", "hex");
    encrypted += cipher.final("hex");
    const tag = cipher.getAuthTag().toString("hex");

    this.vaultData[publicKey] = {
      iv: iv.toString("hex"),
      tag,
      encryptedData: encrypted,
      salt: salt.toString("hex"),
      keyVersion: getActiveKeyVersion(),
    };

    await this.saveVault();
    log.info("Key stored successfully in vault", { publicKey });
  }

  public async getKey(publicKey: string): Promise<string> {
    await this.loadVault();

    const record = this.vaultData[publicKey];
    if (!record) {
      throw new Error(`Key not found in vault: ${publicKey}`);
    }

    const salt = Buffer.from(record.salt, "hex");
    const iv = Buffer.from(record.iv, "hex");
    const tag = Buffer.from(record.tag, "hex");
    const key = await this.getEncryptionKey(salt);

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);

    let decrypted = decipher.update(record.encryptedData, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  }

  public async listPublicKeys(): Promise<string[]> {
    await this.loadVault();
    return Object.keys(this.vaultData);
  }
}

export const vaultService = new VaultService();

/** Issue #198 — Metadata for signing key rotation audits. */
export interface SigningKeyVersion {
  walletId: string;
  keyVersion: string;
  activeFrom: string;
  rotatedAt?: string;
}

export interface InsertSigningKeyVersionInput {
  walletId: string;
  keyVersion: string;
  activeFrom?: string;
  rotatedAt?: string;
}

export interface SigningKeyVersionStore {
  insert(input: InsertSigningKeyVersionInput): Promise<SigningKeyVersion>;
  listByWallet(walletId: string): Promise<SigningKeyVersion[]>;
}

class InMemorySigningKeyVersionStore implements SigningKeyVersionStore {
  private readonly rows: SigningKeyVersion[] = [];

  async insert(input: InsertSigningKeyVersionInput): Promise<SigningKeyVersion> {
    const record: SigningKeyVersion = {
      walletId: input.walletId,
      keyVersion: input.keyVersion,
      activeFrom: input.activeFrom ?? new Date().toISOString(),
      ...(input.rotatedAt ? { rotatedAt: input.rotatedAt } : {}),
    };
    this.rows.push(record);
    return record;
  }

  async listByWallet(walletId: string): Promise<SigningKeyVersion[]> {
    return this.rows.filter((row) => row.walletId === walletId);
  }

  clear(): void {
    this.rows.length = 0;
  }
}

let signingKeyVersionStore: SigningKeyVersionStore = new InMemorySigningKeyVersionStore();

/** Swap for a Postgres implementation backed by signing_key_versions. */
export function setSigningKeyVersionStore(store: SigningKeyVersionStore): void {
  signingKeyVersionStore = store;
}

export function resetSigningKeyVersionStore(): void {
  signingKeyVersionStore = new InMemorySigningKeyVersionStore();
}

/**
 * Persists key-version metadata when encrypting wallet seeds.
 * Backed by `signing_key_versions` (see database/migrations/007_signing_key_versions.sql).
 */
export async function recordSigningKeyVersion(
  input: InsertSigningKeyVersionInput
): Promise<SigningKeyVersion> {
  if (!input.walletId || input.walletId.trim() === "") {
    throw new Error("walletId is required");
  }
  if (!input.keyVersion || input.keyVersion.trim() === "") {
    throw new Error("keyVersion is required");
  }

  return signingKeyVersionStore.insert(input);
}

export async function listSigningKeyVersions(walletId: string): Promise<SigningKeyVersion[]> {
  return signingKeyVersionStore.listByWallet(walletId);
}

export function getActiveKeyVersion(): string {
  return process.env.WALLET_ACTIVE_KEY_VERSION?.trim() || "v1";
}

export function getMasterKeyForVersion(keyVersion: string): string {
  const normalized = keyVersion.trim();
  if (!normalized) {
    throw new Error("keyVersion is required");
  }

  const envKey = process.env[`WALLET_MASTER_SECRET_${normalized.toUpperCase()}`];
  if (envKey && envKey.trim() !== "") {
    return envKey;
  }

  if (normalized === getActiveKeyVersion() || normalized === "v1") {
    return process.env.WALLET_MASTER_SECRET ?? "default-dev-wallet-master-secret-key-32-chars";
  }

  throw new Error(`Unknown signing key version: ${normalized}`);
}

export interface EncryptedSeedPhrase {
  ciphertext: string;
  iv: string;
  authTag: string;
  keyVersion: string;
  algorithm: "aes-256-gcm";
}

export function encryptSeedPhrase(
  plainText: string,
  masterKey?: string,
  keyVersion?: string
): EncryptedSeedPhrase {
  if (!plainText) {
    throw new Error("Plaintext cannot be empty");
  }

  const resolvedVersion = keyVersion?.trim() || getActiveKeyVersion();
  const resolvedMasterKey = masterKey ?? getMasterKeyForVersion(resolvedVersion);
  if (!resolvedMasterKey) {
    throw new Error("Master key cannot be empty");
  }

  const key = crypto.createHash("sha256").update(resolvedMasterKey).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

  let encrypted = cipher.update(plainText, "utf8", "hex");
  encrypted += cipher.final("hex");
  const tag = cipher.getAuthTag().toString("hex");

  return {
    ciphertext: encrypted,
    iv: iv.toString("hex"),
    authTag: tag,
    keyVersion: resolvedVersion,
    algorithm: "aes-256-gcm",
  };
}

export function decryptSeedPhrase(
  ciphertext: string,
  iv: string,
  authTag: string,
  masterKey?: string,
  keyVersion?: string
): string;
export function decryptSeedPhrase(encrypted: EncryptedSeedPhrase, masterKey?: string): string;
export function decryptSeedPhrase(
  ciphertextOrEncrypted: string | EncryptedSeedPhrase,
  ivOrMasterKey?: string,
  authTag?: string,
  masterKey?: string,
  keyVersion?: string
): string {
  let ciphertext: string;
  let iv: string;
  let tag: string;
  let resolvedKeyVersion: string;
  let resolvedMasterKey: string | undefined;

  if (typeof ciphertextOrEncrypted === "object") {
    ciphertext = ciphertextOrEncrypted.ciphertext;
    iv = ciphertextOrEncrypted.iv;
    tag = ciphertextOrEncrypted.authTag;
    resolvedKeyVersion = ciphertextOrEncrypted.keyVersion;
    resolvedMasterKey = ivOrMasterKey;
  } else {
    ciphertext = ciphertextOrEncrypted;
    iv = ivOrMasterKey ?? "";
    tag = authTag ?? "";
    resolvedKeyVersion = keyVersion ?? getActiveKeyVersion();
    resolvedMasterKey = masterKey;
  }

  if (!ciphertext) {
    throw new Error("Ciphertext cannot be empty");
  }
  if (!iv) {
    throw new Error("IV cannot be empty");
  }
  if (!tag) {
    throw new Error("Tag cannot be empty");
  }

  const effectiveMasterKey = resolvedMasterKey ?? getMasterKeyForVersion(resolvedKeyVersion);
  if (!effectiveMasterKey) {
    throw new Error("Master key cannot be empty");
  }

  try {
    const key = crypto.createHash("sha256").update(effectiveMasterKey).digest();
    const ivBuffer = Buffer.from(iv, "hex");
    const tagBuffer = Buffer.from(tag, "hex");

    if (ivBuffer.length !== 12) {
      throw new Error("Invalid IV length for AES-256-GCM (expected 12 bytes)");
    }
    if (tagBuffer.length !== 16) {
      throw new Error("Invalid Auth Tag length for AES-256-GCM (expected 16 bytes)");
    }

    const decipher = crypto.createDecipheriv("aes-256-gcm", key, ivBuffer);
    decipher.setAuthTag(tagBuffer);

    let decrypted = decipher.update(ciphertext, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  } catch (err: any) {
    throw new Error(`Decryption failed: ${err.message}`);
  }
}

export async function encryptAndRecordSeedPhrase(
  walletId: string,
  plainText: string,
  keyVersion?: string
): Promise<EncryptedSeedPhrase> {
  const encrypted = encryptSeedPhrase(plainText, undefined, keyVersion);
  await recordSigningKeyVersion({
    walletId,
    keyVersion: encrypted.keyVersion,
  });
  return encrypted;
}

