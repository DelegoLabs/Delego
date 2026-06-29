import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { Keypair } from "@stellar/stellar-sdk";
import {
  AwsKmsKeySigner,
  KeySignerError,
  LocalFileKeySigner,
  VaultService,
  createKeySigner,
  resolveKeySignerProvider,
  setKeySigner,
} from "./vault.js";

describe("LocalFileKeySigner", () => {
  let vaultPath: string;
  let vault: VaultService;

  beforeEach(async () => {
    vaultPath = path.join(
      os.tmpdir(),
      `delego-vault-signer-${Date.now()}-${Math.random().toString(16).slice(2)}.json`
    );
    process.env.VAULT_FILE_PATH = vaultPath;
    vault = new VaultService();
  });

  afterEach(async () => {
    delete process.env.VAULT_FILE_PATH;
    await fs.rm(vaultPath, { force: true });
    setKeySigner(null);
  });

  it("signs payloads without exposing private key material", async () => {
    const keypair = Keypair.random();
    await vault.storeKey(keypair.publicKey(), keypair.secret());

    const signer = new LocalFileKeySigner({ vault });
    const payload = Buffer.from("stellar-transaction-hash-payload");
    const signature = await signer.sign(payload, keypair.publicKey());

    expect(signature).toBeInstanceOf(Buffer);
    expect(signature.length).toBe(64);
    expect(keypair.verify(payload, signature)).toBe(true);
    expect(Object.keys(signer)).not.toContain("getKey");
    expect(typeof (signer as { getKey?: unknown }).getKey).toBe("undefined");
  });

  it("returns the stellar public key for a stored key id", async () => {
    const keypair = Keypair.random();
    await vault.storeKey(keypair.publicKey(), keypair.secret());

    const signer = new LocalFileKeySigner({ vault });
    await expect(signer.getPublicKey(keypair.publicKey())).resolves.toBe(keypair.publicKey());
  });

  it("is idempotent for identical sign requests", async () => {
    const keypair = Keypair.random();
    await vault.storeKey(keypair.publicKey(), keypair.secret());

    const signer = new LocalFileKeySigner({ vault });
    const payload = Buffer.from("retry-safe-signing-payload");
    const first = await signer.sign(payload, keypair.publicKey());
    const second = await signer.sign(payload, keypair.publicKey());

    expect(first.equals(second)).toBe(true);
  });

  it("fails with a stable error when the key is missing", async () => {
    const signer = new LocalFileKeySigner({ vault });
    await expect(signer.sign(Buffer.from("payload"), "GMISSING")).rejects.toMatchObject({
      code: "KEY_SIGNER_KEY_NOT_FOUND",
    });
  });
});

describe("AwsKmsKeySigner", () => {
  const kmsKeyId = "arn:aws:kms:us-east-1:123456789012:key/11111111-1111-1111-1111-111111111111";
  const rawPublicKey = Buffer.alloc(32, 7);
  const spkiPublicKey = Buffer.concat([
    Buffer.from("302a300506032b6570032100", "hex"),
    rawPublicKey,
  ]);
  const kmsSignature = Buffer.alloc(64, 9);

  it("signs via KMS without returning private key material", async () => {
    const send = vi.fn(async (command: { constructor: { name: string }; input: Record<string, unknown> }) => {
      if (command.constructor.name === "SignCommand") {
        expect(command.input).toMatchObject({
          KeyId: kmsKeyId,
          MessageType: "RAW",
          SigningAlgorithm: "ED25519_SHA_512",
        });
        return { Signature: kmsSignature };
      }
      throw new Error(`Unexpected command: ${command.constructor.name}`);
    });

    const signer = new AwsKmsKeySigner({ client: { send }, defaultKeyId: kmsKeyId });
    const payload = Buffer.from("kms-signing-payload");
    const signature = await signer.sign(payload, kmsKeyId);

    expect(signature.equals(kmsSignature)).toBe(true);
    expect(send).toHaveBeenCalledTimes(1);
    expect(Object.keys(signer)).not.toContain("getKey");
  });

  it("fetches and encodes the stellar public key from KMS", async () => {
    const send = vi.fn(async (command: { constructor: { name: string } }) => {
      if (command.constructor.name === "GetPublicKeyCommand") {
        return { PublicKey: spkiPublicKey };
      }
      throw new Error(`Unexpected command: ${command.constructor.name}`);
    });

    const signer = new AwsKmsKeySigner({ client: { send }, defaultKeyId: kmsKeyId });
    const publicKey = await signer.getPublicKey(kmsKeyId);

    expect(publicKey.startsWith("G")).toBe(true);
    expect(publicKey.length).toBe(56);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("marks transient KMS failures as retryable", async () => {
    const send = vi.fn(async () => {
      throw new Error("ServiceUnavailable: KMS is temporarily unavailable");
    });

    const signer = new AwsKmsKeySigner({ client: { send }, defaultKeyId: kmsKeyId });

    await expect(signer.sign(Buffer.from("payload"), kmsKeyId)).rejects.toMatchObject({
      code: "KEY_SIGNER_KMS_UNAVAILABLE",
      retryable: true,
    } satisfies Partial<KeySignerError>);
  });

  it("requires a key id when no default is configured", async () => {
    const signer = new AwsKmsKeySigner({ client: { send: vi.fn() } });
    await expect(signer.sign(Buffer.from("payload"), "")).rejects.toMatchObject({
      code: "KEY_SIGNER_MISSING_KEY_ID",
    });
  });
});

describe("createKeySigner", () => {
  afterEach(() => {
    delete process.env.WALLET_KEY_SIGNER_PROVIDER;
    delete process.env.WALLET_KEY_SIGNER_KEY_ID;
    setKeySigner(null);
  });

  it("defaults to the local file driver", () => {
    expect(resolveKeySignerProvider()).toEqual({ provider: "local", keyId: "" });
    expect(createKeySigner()).toBeInstanceOf(LocalFileKeySigner);
  });

  it("selects AWS KMS when configured", () => {
    process.env.WALLET_KEY_SIGNER_PROVIDER = "aws-kms";
    process.env.WALLET_KEY_SIGNER_KEY_ID = "alias/delego-signer";

    const signer = createKeySigner(undefined, {
      aws: { client: { send: vi.fn() } },
    });

    expect(signer).toBeInstanceOf(AwsKmsKeySigner);
    expect(resolveKeySignerProvider()).toEqual({
      provider: "aws-kms",
      keyId: "alias/delego-signer",
    });
  });
});
