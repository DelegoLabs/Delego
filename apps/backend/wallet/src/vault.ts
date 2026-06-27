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
  private vaultData: Record<string, { iv: string; tag: string; encryptedData: string; salt: string }> = {};

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

export interface EncryptedSeedPhrase {
  ciphertext: string;
  iv: string;
  authTag: string;
  keyVersion: string;
  algorithm: "aes-256-gcm";
}

export function encryptSeedPhrase(
  plainText: string,
  masterKey: string
): EncryptedSeedPhrase {
  if (!plainText) {
    throw new Error("Plaintext cannot be empty");
  }
  if (!masterKey) {
    throw new Error("Master key cannot be empty");
  }

  const key = crypto.createHash("sha256").update(masterKey).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

  let encrypted = cipher.update(plainText, "utf8", "hex");
  encrypted += cipher.final("hex");
  const tag = cipher.getAuthTag().toString("hex");

  return {
    ciphertext: encrypted,
    iv: iv.toString("hex"),
    authTag: tag,
    keyVersion: "v1",
    algorithm: "aes-256-gcm",
  };
}

export function decryptSeedPhrase(
  ciphertext: string,
  iv: string,
  authTag: string,
  masterKey: string
): string {
  if (!ciphertext) {
    throw new Error("Ciphertext cannot be empty");
  }
  if (!iv) {
    throw new Error("IV cannot be empty");
  }
  if (!authTag) {
    throw new Error("Tag cannot be empty");
  }
  if (!masterKey) {
    throw new Error("Master key cannot be empty");
  }

  try {
    const key = crypto.createHash("sha256").update(masterKey).digest();
    const ivBuffer = Buffer.from(iv, "hex");
    const tagBuffer = Buffer.from(authTag, "hex");

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

