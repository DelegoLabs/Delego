/**
 * Tests for Stellar Account Merge and Recovery (Issue #355).
 */

import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Keypair } from "@stellar/stellar-sdk";

import { VaultService } from "../../src/vault.js";
import { mergeAccount, previewMerge } from "./recovery.js";

let vaultPath: string;
let vault: VaultService;

beforeEach(async () => {
  vaultPath = path.join(
    os.tmpdir(),
    `delego-recovery-test-${Date.now()}-${Math.random().toString(16).slice(2)}.json`
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

describe("mergeAccount", () => {
  it("rejects invalid source address", async () => {
    await expect(
      mergeAccount({
        sourceAddress: "not-a-valid-key",
        destinationAddress: Keypair.random().publicKey(),
      })
    ).rejects.toThrow("Invalid source Stellar public key address");
  });

  it("rejects invalid destination address", async () => {
    const kp = Keypair.random();
    await vault.storeKey(kp.publicKey(), kp.secret());

    await expect(
      mergeAccount({
        sourceAddress: kp.publicKey(),
        destinationAddress: "not-a-valid-key",
      })
    ).rejects.toThrow("Invalid destination Stellar public key address");
  });

  it("rejects when source and destination are the same", async () => {
    const kp = Keypair.random();
    await vault.storeKey(kp.publicKey(), kp.secret());

    await expect(
      mergeAccount({
        sourceAddress: kp.publicKey(),
        destinationAddress: kp.publicKey(),
      })
    ).rejects.toThrow("Source and destination addresses must be different");
  });

  it("rejects when source key is not in the vault", async () => {
    const source = Keypair.random();
    const dest = Keypair.random();
    // Do NOT store source key in vault

    await expect(
      mergeAccount({
        sourceAddress: source.publicKey(),
        destinationAddress: dest.publicKey(),
      })
    ).rejects.toThrow();
  });
});

describe("previewMerge", () => {
  it("rejects invalid source address", async () => {
    await expect(
      previewMerge({ sourceAddress: "invalid" })
    ).rejects.toThrow("Invalid source Stellar public key address");
  });
});
