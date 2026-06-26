import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { encryptSeedPhrase, decryptSeedPhrase } from "../../../apps/backend/wallet/dist/src/vault.js";

describe("Key Vault Encryption for Hot Wallet BIP-39 Seed Phrases", () => {
  const masterKey = "super-secret-master-key-123456";
  const seedPhrase = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

  it("should encrypt and the output should differ from input", () => {
    const encrypted = encryptSeedPhrase(seedPhrase, masterKey);
    assert.ok(encrypted.ciphertext);
    assert.ok(encrypted.iv);
    assert.ok(encrypted.authTag);
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
});
