import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  encryptSeedPhrase,
  decryptSeedPhrase,
  encryptAndRecordSeedPhrase,
  getActiveKeyVersion,
  listSigningKeyVersions,
  resetSigningKeyVersionStore,
} from "../../../apps/backend/wallet/dist/src/vault.js";

describe("Key Vault Encryption for Hot Wallet BIP-39 Seed Phrases", () => {
  const masterKey = "super-secret-master-key-123456";
  const seedPhrase = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
  const originalActiveVersion = process.env.WALLET_ACTIVE_KEY_VERSION;
  const originalMasterSecret = process.env.WALLET_MASTER_SECRET;
  const originalV2Secret = process.env.WALLET_MASTER_SECRET_V2;

  beforeEach(() => {
    resetSigningKeyVersionStore();
  });

  afterEach(() => {
    if (originalActiveVersion === undefined) {
      delete process.env.WALLET_ACTIVE_KEY_VERSION;
    } else {
      process.env.WALLET_ACTIVE_KEY_VERSION = originalActiveVersion;
    }
    if (originalMasterSecret === undefined) {
      delete process.env.WALLET_MASTER_SECRET;
    } else {
      process.env.WALLET_MASTER_SECRET = originalMasterSecret;
    }
    if (originalV2Secret === undefined) {
      delete process.env.WALLET_MASTER_SECRET_V2;
    } else {
      process.env.WALLET_MASTER_SECRET_V2 = originalV2Secret;
    }
  });

  it("should encrypt and the output should differ from input", () => {
    const encrypted = encryptSeedPhrase(seedPhrase, masterKey);
    assert.ok(encrypted.ciphertext);
    assert.ok(encrypted.iv);
    assert.ok(encrypted.authTag);
    assert.equal(encrypted.keyVersion, getActiveKeyVersion());
    assert.notEqual(encrypted.ciphertext, seedPhrase);
  });

  it("should decrypt with matching keys and recover original plain text", () => {
    const encrypted = encryptSeedPhrase(seedPhrase, masterKey);
    const decrypted = decryptSeedPhrase(
      encrypted.ciphertext,
      encrypted.iv,
      encrypted.authTag,
      masterKey
    );
    assert.equal(decrypted, seedPhrase);
  });

  it("should fail decryption if key is invalid", () => {
    const encrypted = encryptSeedPhrase(seedPhrase, masterKey);
    const wrongKey = "wrong-master-key-789012";
    assert.throws(() => {
      decryptSeedPhrase(encrypted.ciphertext, encrypted.iv, encrypted.authTag, wrongKey);
    });
  });

  it("should fail decryption if tag is invalid", () => {
    const encrypted = encryptSeedPhrase(seedPhrase, masterKey);
    const corruptedTag = encrypted.authTag.substring(0, encrypted.authTag.length - 2) + "00";
    assert.throws(() => {
      decryptSeedPhrase(encrypted.ciphertext, encrypted.iv, corruptedTag, masterKey);
    });
  });

  it("should fail decryption if IV is invalid", () => {
    const encrypted = encryptSeedPhrase(seedPhrase, masterKey);
    const corruptedIv = encrypted.iv.substring(0, encrypted.iv.length - 2) + "00";
    assert.throws(() => {
      decryptSeedPhrase(encrypted.ciphertext, corruptedIv, encrypted.authTag, masterKey);
    });
  });

  it("uses the default active key version when none is provided", () => {
    process.env.WALLET_ACTIVE_KEY_VERSION = "v1";
    const encrypted = encryptSeedPhrase(seedPhrase);
    assert.equal(encrypted.keyVersion, "v1");
    const decrypted = decryptSeedPhrase(encrypted);
    assert.equal(decrypted, seedPhrase);
  });

  it("encrypts with an explicit key version and resolves the matching master secret", () => {
    process.env.WALLET_MASTER_SECRET_V2 = "rotation-secret-v2-key-material";
    const encrypted = encryptSeedPhrase(seedPhrase, undefined, "v2");
    assert.equal(encrypted.keyVersion, "v2");
    const decrypted = decryptSeedPhrase(encrypted);
    assert.equal(decrypted, seedPhrase);
  });

  it("records signing key version metadata when encrypting for a wallet", async () => {
    await encryptAndRecordSeedPhrase("wallet-123", seedPhrase, "v1");
    const versions = await listSigningKeyVersions("wallet-123");
    assert.equal(versions.length, 1);
    assert.equal(versions[0].walletId, "wallet-123");
    assert.equal(versions[0].keyVersion, "v1");
  });

  it("rejects unknown key versions during decryption", () => {
    const encrypted = encryptSeedPhrase(seedPhrase, masterKey, "v9");
    assert.throws(() => {
      decryptSeedPhrase(encrypted);
    }, /Unknown signing key version: v9/);
  });
});
