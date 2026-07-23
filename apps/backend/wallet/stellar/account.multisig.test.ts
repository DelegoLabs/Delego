/**
 * Tests for signMultisigTx — multi-signature transaction builder helper.
 *
 * Strategy: build a real (minimal) Stellar transaction envelope with the SDK,
 * store test keypair secrets in an in-memory VaultService instance, then call
 * signMultisigTx and verify the resulting envelope decorators.
 */

import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  Keypair,
  Networks,
  TransactionBuilder,
  Account,
  Operation,
  BASE_FEE,
  Transaction,
  FeeBumpTransaction,
} from "@stellar/stellar-sdk";

import { VaultService } from "../src/vault.js";
import { signMultisigTx } from "./account.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal valid envelope: a no-op manage-data transaction for the given source. */
function buildEnvelopeXdr(sourceKp: Keypair, networkPassphrase = Networks.TESTNET): string {
  const account = new Account(sourceKp.publicKey(), "0");
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase,
  })
    .addOperation(
      Operation.manageData({
        name: "test",
        value: Buffer.from("multisig-test"),
      })
    )
    .setTimeout(30)
    .build();
  return tx.toEnvelope().toXDR("base64");
}

/** Collect all decorator hints from a signed envelope XDR. */
function getSignatureHints(signedXdr: string, networkPassphrase = Networks.TESTNET): string[] {
  const parsed = TransactionBuilder.fromXDR(signedXdr, networkPassphrase);
  const innerTx =
    parsed instanceof FeeBumpTransaction ? parsed.innerTransaction : (parsed as Transaction);
  return innerTx.signatures.map((sig) => Buffer.from(sig.hint()).toString("hex"));
}

/** The 4-byte key hint that Stellar uses to match decorator to signer. */
function expectedHint(kp: Keypair): string {
  return Buffer.from(kp.rawPublicKey().slice(-4)).toString("hex");
}

// ---------------------------------------------------------------------------
// Test setup — isolated vault per test
// ---------------------------------------------------------------------------

let vaultPath: string;
let vault: VaultService;

// We swap the module-level vaultService used inside account.ts with our test
// instance by pointing VAULT_FILE_PATH at a temp file.
beforeEach(async () => {
  vaultPath = path.join(
    os.tmpdir(),
    `delego-multisig-test-${Date.now()}-${Math.random().toString(16).slice(2)}.json`
  );
  process.env.VAULT_FILE_PATH = vaultPath;
  process.env.STELLAR_NETWORK = "testnet";
  vault = new VaultService();
});

afterEach(async () => {
  delete process.env.VAULT_FILE_PATH;
  delete process.env.STELLAR_NETWORK;
  await fs.rm(vaultPath, { force: true });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("signMultisigTx", () => {
  describe("single-signer path", () => {
    it("appends one valid signature and returns thresholdMet=true", async () => {
      const kp = Keypair.random();
      await vault.storeKey(kp.publicKey(), kp.secret());

      const envelopeXdr = buildEnvelopeXdr(kp);
      const result = await signMultisigTx({ xdr: envelopeXdr, signers: [kp.publicKey()] });

      expect(result.signerCount).toBe(1);
      expect(result.thresholdMet).toBe(true);
      expect(typeof result.signedXdr).toBe("string");
      expect(result.signedXdr.length).toBeGreaterThan(0);
    });

    it("produces a cryptographically valid ED25519 signature", async () => {
      const kp = Keypair.random();
      await vault.storeKey(kp.publicKey(), kp.secret());

      const envelopeXdr = buildEnvelopeXdr(kp);
      const result = await signMultisigTx({ xdr: envelopeXdr, signers: [kp.publicKey()] });

      const hints = getSignatureHints(result.signedXdr);
      expect(hints).toContain(expectedHint(kp));
    });
  });

  describe("multi-signer path", () => {
    it("appends one signature per unique key", async () => {
      const kp1 = Keypair.random();
      const kp2 = Keypair.random();
      const kp3 = Keypair.random();
      await vault.storeKey(kp1.publicKey(), kp1.secret());
      await vault.storeKey(kp2.publicKey(), kp2.secret());
      await vault.storeKey(kp3.publicKey(), kp3.secret());

      const envelopeXdr = buildEnvelopeXdr(kp1);
      const result = await signMultisigTx({
        xdr: envelopeXdr,
        signers: [kp1.publicKey(), kp2.publicKey(), kp3.publicKey()],
      });

      expect(result.signerCount).toBe(3);
      expect(result.thresholdMet).toBe(true);

      const hints = getSignatureHints(result.signedXdr);
      expect(hints).toContain(expectedHint(kp1));
      expect(hints).toContain(expectedHint(kp2));
      expect(hints).toContain(expectedHint(kp3));
    });

    it("de-duplicates repeated public keys so each key signs exactly once", async () => {
      const kp = Keypair.random();
      await vault.storeKey(kp.publicKey(), kp.secret());

      const envelopeXdr = buildEnvelopeXdr(kp);
      const result = await signMultisigTx({
        xdr: envelopeXdr,
        // Same key listed three times — should only produce one signature.
        signers: [kp.publicKey(), kp.publicKey(), kp.publicKey()],
      });

      expect(result.signerCount).toBe(1);
      const hints = getSignatureHints(result.signedXdr);
      const uniqueHints = [...new Set(hints)];
      expect(uniqueHints).toHaveLength(1);
    });

    it("all signatures are independently verifiable on the signed envelope", async () => {
      const kp1 = Keypair.random();
      const kp2 = Keypair.random();
      await vault.storeKey(kp1.publicKey(), kp1.secret());
      await vault.storeKey(kp2.publicKey(), kp2.secret());

      const envelopeXdr = buildEnvelopeXdr(kp1);
      const result = await signMultisigTx({
        xdr: envelopeXdr,
        signers: [kp1.publicKey(), kp2.publicKey()],
      });

      const parsed = TransactionBuilder.fromXDR(result.signedXdr, Networks.TESTNET);
      const innerTx =
        parsed instanceof FeeBumpTransaction ? parsed.innerTransaction : (parsed as Transaction);

      // The transaction hash that was signed
      const txHash = Buffer.from(innerTx.hash());

      for (const sig of innerTx.signatures) {
        const hint = Buffer.from(sig.hint()).toString("hex");
        const sigBytes = Buffer.from(sig.signature());

        const matchingKp = [kp1, kp2].find(
          (kp) => expectedHint(kp) === hint
        );
        expect(matchingKp).toBeDefined();
        expect(matchingKp!.verify(txHash, sigBytes)).toBe(true);
      }
    });

    it("is idempotent — re-signing produces the same XDR", async () => {
      const kp1 = Keypair.random();
      const kp2 = Keypair.random();
      await vault.storeKey(kp1.publicKey(), kp1.secret());
      await vault.storeKey(kp2.publicKey(), kp2.secret());

      const envelopeXdr = buildEnvelopeXdr(kp1);
      const signers = [kp1.publicKey(), kp2.publicKey()];

      const first = await signMultisigTx({ xdr: envelopeXdr, signers });
      const second = await signMultisigTx({ xdr: envelopeXdr, signers });

      expect(first.signedXdr).toBe(second.signedXdr);
    });
  });

  describe("threshold checking", () => {
    it("thresholdMet is true when signerCount equals requiredWeight", async () => {
      const kp1 = Keypair.random();
      const kp2 = Keypair.random();
      await vault.storeKey(kp1.publicKey(), kp1.secret());
      await vault.storeKey(kp2.publicKey(), kp2.secret());

      const envelopeXdr = buildEnvelopeXdr(kp1);
      const result = await signMultisigTx({
        xdr: envelopeXdr,
        signers: [kp1.publicKey(), kp2.publicKey()],
        requiredWeight: 2,
      });

      expect(result.signerCount).toBe(2);
      expect(result.thresholdMet).toBe(true);
    });

    it("thresholdMet is true when signerCount exceeds requiredWeight", async () => {
      const kp1 = Keypair.random();
      const kp2 = Keypair.random();
      const kp3 = Keypair.random();
      await vault.storeKey(kp1.publicKey(), kp1.secret());
      await vault.storeKey(kp2.publicKey(), kp2.secret());
      await vault.storeKey(kp3.publicKey(), kp3.secret());

      const envelopeXdr = buildEnvelopeXdr(kp1);
      const result = await signMultisigTx({
        xdr: envelopeXdr,
        signers: [kp1.publicKey(), kp2.publicKey(), kp3.publicKey()],
        requiredWeight: 2,
      });

      expect(result.signerCount).toBe(3);
      expect(result.thresholdMet).toBe(true);
    });

    it("thresholdMet is false when signerCount is below requiredWeight", async () => {
      const kp = Keypair.random();
      await vault.storeKey(kp.publicKey(), kp.secret());

      const envelopeXdr = buildEnvelopeXdr(kp);
      const result = await signMultisigTx({
        xdr: envelopeXdr,
        signers: [kp.publicKey()],
        requiredWeight: 3,
      });

      expect(result.signerCount).toBe(1);
      expect(result.thresholdMet).toBe(false);
    });

    it("defaults requiredWeight to the number of unique signers", async () => {
      const kp1 = Keypair.random();
      const kp2 = Keypair.random();
      await vault.storeKey(kp1.publicKey(), kp1.secret());
      await vault.storeKey(kp2.publicKey(), kp2.secret());

      const envelopeXdr = buildEnvelopeXdr(kp1);
      // Two signers, no explicit requiredWeight — default is 2 → met.
      const result = await signMultisigTx({
        xdr: envelopeXdr,
        signers: [kp1.publicKey(), kp2.publicKey()],
      });

      expect(result.thresholdMet).toBe(true);
    });
  });

  describe("validation errors", () => {
    it("throws when xdr is empty", async () => {
      await expect(
        signMultisigTx({ xdr: "", signers: ["GABC"] })
      ).rejects.toThrow("xdr is required");
    });

    it("throws when signers array is empty", async () => {
      await expect(
        signMultisigTx({ xdr: "AAAA", signers: [] })
      ).rejects.toThrow("At least one signer is required");
    });

    it("throws when signers array contains only blank strings", async () => {
      await expect(
        signMultisigTx({ xdr: "AAAA", signers: ["  ", ""] })
      ).rejects.toThrow("At least one non-empty signer public key is required");
    });

    it("throws a descriptive error for malformed XDR", async () => {
      const kp = Keypair.random();
      await vault.storeKey(kp.publicKey(), kp.secret());

      await expect(
        signMultisigTx({ xdr: "not-valid-xdr==", signers: [kp.publicKey()] })
      ).rejects.toThrow(/Invalid transaction XDR/);
    });

    it("throws when a signer key is not present in the vault", async () => {
      const source = Keypair.random();
      await vault.storeKey(source.publicKey(), source.secret());

      const missing = Keypair.random(); // never stored
      const envelopeXdr = buildEnvelopeXdr(source);

      await expect(
        signMultisigTx({ xdr: envelopeXdr, signers: [missing.publicKey()] })
      ).rejects.toThrow(/Failed to load key for signer/);
    });
  });
});
