import * as crypto from "node:crypto";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import {
  GetPublicKeyCommand,
  KMSClient,
  SignCommand,
  SigningAlgorithmSpec,
  type KMSClientConfig,
} from "@aws-sdk/client-kms";
import { Keypair, StrKey } from "@stellar/stellar-sdk";
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

// --- HSM Key Signer Adapter ---

export interface KeySigner {
  sign(data: Buffer, keyId: string): Promise<Buffer>;
  getPublicKey(keyId: string): Promise<string>;
}

export interface KeySignerProvider {
  provider: "local" | "aws-kms" | "hashicorp-vault";
  keyId: string;
}

export class KeySignerError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly retryable = false
  ) {
    super(message);
    this.name = "KeySignerError";
  }
}

const KEY_SIGNER_PROVIDERS = new Set<KeySignerProvider["provider"]>([
  "local",
  "aws-kms",
  "hashicorp-vault",
]);

function parseKeySignerProvider(value: string | undefined): KeySignerProvider["provider"] {
  const normalized = value?.trim().toLowerCase();
  if (!normalized || normalized === "local") {
    return "local";
  }
  if (KEY_SIGNER_PROVIDERS.has(normalized as KeySignerProvider["provider"])) {
    return normalized as KeySignerProvider["provider"];
  }
  throw new KeySignerError(
    "KEY_SIGNER_INVALID_PROVIDER",
    `Unsupported key signer provider: ${value}`
  );
}

export function resolveKeySignerProvider(
  overrides?: Partial<KeySignerProvider>
): KeySignerProvider {
  const provider = parseKeySignerProvider(
    overrides?.provider ?? process.env.WALLET_KEY_SIGNER_PROVIDER
  );
  const keyId =
    overrides?.keyId?.trim() ||
    process.env.WALLET_KEY_SIGNER_KEY_ID?.trim() ||
    "";

  return { provider, keyId };
}

function resolveEffectiveKeyId(requestedKeyId: string, defaultKeyId: string): string {
  const effective = requestedKeyId.trim() || defaultKeyId.trim();
  if (!effective) {
    throw new KeySignerError("KEY_SIGNER_MISSING_KEY_ID", "keyId is required");
  }
  return effective;
}

function extractEd25519PublicKeyFromSpki(spki: Uint8Array): Buffer {
  if (spki.length === 44 && spki[0] === 0x30 && spki[spki.length - 33] === 0x00) {
    return Buffer.from(spki.slice(-32));
  }
  throw new KeySignerError(
    "KEY_SIGNER_INVALID_PUBLIC_KEY",
    "Unsupported ED25519 public key format from provider"
  );
}

function encodeStellarPublicKey(rawPublicKey: Uint8Array): string {
  return StrKey.encodeEd25519PublicKey(Buffer.from(rawPublicKey));
}

function parseVaultTransitSignature(signature: string): Buffer {
  const parts = signature.split(":");
  const encoded = parts[parts.length - 1];
  if (!encoded) {
    throw new KeySignerError(
      "KEY_SIGNER_INVALID_SIGNATURE",
      "HashiCorp Vault returned an invalid signature payload"
    );
  }
  return Buffer.from(encoded, "base64");
}

export interface LocalFileKeySignerOptions {
  vault?: VaultService;
}

/** Development driver — signs with encrypted file-vault material; never exposes secrets. */
export class LocalFileKeySigner implements KeySigner {
  private readonly vault: VaultService;

  constructor(options: LocalFileKeySignerOptions = {}) {
    this.vault = options.vault ?? vaultService;
  }

  async sign(data: Buffer, keyId: string): Promise<Buffer> {
    try {
      const secret = await this.vault.getKey(keyId);
      const keypair = Keypair.fromSecret(secret);
      return Buffer.from(keypair.sign(data));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("Key not found")) {
        throw new KeySignerError("KEY_SIGNER_KEY_NOT_FOUND", message);
      }
      throw new KeySignerError("KEY_SIGNER_SIGN_FAILED", message);
    }
  }

  async getPublicKey(keyId: string): Promise<string> {
    const keys = await this.vault.listPublicKeys();
    if (!keys.includes(keyId)) {
      throw new KeySignerError("KEY_SIGNER_KEY_NOT_FOUND", `Key not found in vault: ${keyId}`);
    }
    return keyId;
  }
}

export interface AwsKmsKeySignerOptions {
  region?: string;
  defaultKeyId?: string;
  client?: Pick<KMSClient, "send">;
  clientConfig?: KMSClientConfig;
}

/** Production driver — delegates signing to AWS KMS ED25519 keys. */
export class AwsKmsKeySigner implements KeySigner {
  private readonly client: Pick<KMSClient, "send">;
  private readonly defaultKeyId: string;

  constructor(options: AwsKmsKeySignerOptions = {}) {
    this.defaultKeyId = options.defaultKeyId ?? "";
    this.client =
      options.client ??
      new KMSClient({
        region: options.region ?? process.env.AWS_REGION ?? "us-east-1",
        ...options.clientConfig,
      });
  }

  async sign(data: Buffer, keyId: string): Promise<Buffer> {
    const effectiveKeyId = resolveEffectiveKeyId(keyId, this.defaultKeyId);

    try {
      const response = await this.client.send(
        new SignCommand({
          KeyId: effectiveKeyId,
          Message: data,
          MessageType: "RAW",
          SigningAlgorithm: SigningAlgorithmSpec.ED25519_SHA_512,
        })
      );

      if (!response.Signature || response.Signature.length === 0) {
        throw new KeySignerError(
          "KEY_SIGNER_EMPTY_SIGNATURE",
          "AWS KMS returned an empty signature"
        );
      }

      return Buffer.from(response.Signature);
    } catch (err: unknown) {
      if (err instanceof KeySignerError) {
        throw err;
      }
      const message = err instanceof Error ? err.message : String(err);
      const retryable =
        message.includes("timeout") ||
        message.includes("ECONNRESET") ||
        message.includes("ServiceUnavailable");
      throw new KeySignerError("KEY_SIGNER_KMS_UNAVAILABLE", message, retryable);
    }
  }

  async getPublicKey(keyId: string): Promise<string> {
    const effectiveKeyId = resolveEffectiveKeyId(keyId, this.defaultKeyId);

    try {
      const response = await this.client.send(
        new GetPublicKeyCommand({ KeyId: effectiveKeyId })
      );

      if (!response.PublicKey || response.PublicKey.length === 0) {
        throw new KeySignerError(
          "KEY_SIGNER_EMPTY_PUBLIC_KEY",
          "AWS KMS returned an empty public key"
        );
      }

      const rawPublicKey = extractEd25519PublicKeyFromSpki(response.PublicKey);
      return encodeStellarPublicKey(rawPublicKey);
    } catch (err: unknown) {
      if (err instanceof KeySignerError) {
        throw err;
      }
      const message = err instanceof Error ? err.message : String(err);
      const retryable =
        message.includes("timeout") ||
        message.includes("ECONNRESET") ||
        message.includes("ServiceUnavailable");
      throw new KeySignerError("KEY_SIGNER_KMS_UNAVAILABLE", message, retryable);
    }
  }
}

export interface HashicorpVaultKeySignerOptions {
  addr?: string;
  token?: string;
  mount?: string;
  defaultKeyId?: string;
  fetchImpl?: typeof fetch;
}

/** Production driver — signs via HashiCorp Vault transit engine. */
export class HashicorpVaultKeySigner implements KeySigner {
  private readonly addr: string;
  private readonly token: string;
  private readonly mount: string;
  private readonly defaultKeyId: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: HashicorpVaultKeySignerOptions = {}) {
    this.addr = (options.addr ?? process.env.VAULT_ADDR ?? "").replace(/\/$/, "");
    this.token = options.token ?? process.env.VAULT_TOKEN ?? "";
    this.mount = options.mount ?? process.env.VAULT_TRANSIT_MOUNT ?? "transit";
    this.defaultKeyId = options.defaultKeyId ?? "";
    this.fetchImpl = options.fetchImpl ?? fetch;

    if (!this.addr) {
      throw new KeySignerError(
        "KEY_SIGNER_VAULT_CONFIG",
        "VAULT_ADDR is required for hashicorp-vault key signer"
      );
    }
    if (!this.token) {
      throw new KeySignerError(
        "KEY_SIGNER_VAULT_CONFIG",
        "VAULT_TOKEN is required for hashicorp-vault key signer"
      );
    }
  }

  private async vaultRequest(
    method: "GET" | "POST",
    path: string,
    body?: Record<string, string>
  ): Promise<any> {
    const response = await this.fetchImpl(`${this.addr}${path}`, {
      method,
      headers: {
        "X-Vault-Token": this.token,
        "Content-Type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message =
        typeof payload?.errors?.[0] === "string"
          ? payload.errors[0]
          : `Vault request failed with status ${response.status}`;
      const retryable = response.status >= 500 || response.status === 429;
      throw new KeySignerError("KEY_SIGNER_VAULT_UNAVAILABLE", message, retryable);
    }

    return payload;
  }

  async sign(data: Buffer, keyId: string): Promise<Buffer> {
    const effectiveKeyId = resolveEffectiveKeyId(keyId, this.defaultKeyId);
    const path = `/v1/${this.mount}/sign/${encodeURIComponent(effectiveKeyId)}`;

    try {
      const payload = await this.vaultRequest("POST", path, {
        input: data.toString("base64"),
      });
      const signature = payload?.data?.signature;
      if (typeof signature !== "string" || signature.trim() === "") {
        throw new KeySignerError(
          "KEY_SIGNER_EMPTY_SIGNATURE",
          "HashiCorp Vault returned an empty signature"
        );
      }
      return parseVaultTransitSignature(signature);
    } catch (err: unknown) {
      if (err instanceof KeySignerError) {
        throw err;
      }
      const message = err instanceof Error ? err.message : String(err);
      throw new KeySignerError("KEY_SIGNER_VAULT_UNAVAILABLE", message, true);
    }
  }

  async getPublicKey(keyId: string): Promise<string> {
    const effectiveKeyId = resolveEffectiveKeyId(keyId, this.defaultKeyId);
    const path = `/v1/${this.mount}/keys/${encodeURIComponent(effectiveKeyId)}`;

    try {
      const payload = await this.vaultRequest("GET", path);
      const publicKey = payload?.data?.keys?.["1"]?.public_key;
      if (typeof publicKey !== "string" || publicKey.trim() === "") {
        throw new KeySignerError(
          "KEY_SIGNER_EMPTY_PUBLIC_KEY",
          "HashiCorp Vault returned an empty public key"
        );
      }
      return encodeStellarPublicKey(Buffer.from(publicKey, "base64"));
    } catch (err: unknown) {
      if (err instanceof KeySignerError) {
        throw err;
      }
      const message = err instanceof Error ? err.message : String(err);
      throw new KeySignerError("KEY_SIGNER_VAULT_UNAVAILABLE", message, true);
    }
  }
}

export interface CreateKeySignerOptions {
  local?: LocalFileKeySignerOptions;
  aws?: AwsKmsKeySignerOptions;
  vault?: HashicorpVaultKeySignerOptions;
}

export function createKeySigner(
  providerConfig?: KeySignerProvider,
  options: CreateKeySignerOptions = {}
): KeySigner {
  const config = providerConfig ?? resolveKeySignerProvider();

  switch (config.provider) {
    case "local":
      return new LocalFileKeySigner(options.local);
    case "aws-kms":
      return new AwsKmsKeySigner({
        defaultKeyId: config.keyId,
        ...options.aws,
      });
    case "hashicorp-vault":
      return new HashicorpVaultKeySigner({
        defaultKeyId: config.keyId,
        ...options.vault,
      });
    default:
      throw new KeySignerError(
        "KEY_SIGNER_INVALID_PROVIDER",
        `Unsupported key signer provider: ${(config as KeySignerProvider).provider}`
      );
  }
}

let keySignerInstance: KeySigner | null = null;

export function getKeySigner(): KeySigner {
  if (!keySignerInstance) {
    keySignerInstance = createKeySigner();
  }
  return keySignerInstance;
}

export function setKeySigner(signer: KeySigner | null): void {
  keySignerInstance = signer;
}

