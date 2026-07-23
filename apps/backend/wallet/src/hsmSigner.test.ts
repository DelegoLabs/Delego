import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Keypair } from "@stellar/stellar-sdk";
import { HsmKeySigner, type HSMKeySignerAdapter } from "./hsmSigner.js";
import { VaultService } from "./vault.js";

describe("HsmKeySigner", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  let vaultPath: string;

  beforeEach(() => {
    vaultPath = path.join(
      os.tmpdir(),
      `delego-hsm-vault-${Date.now()}-${Math.random().toString(16).slice(2)}.json`
    );
    process.env.VAULT_FILE_PATH = vaultPath;
  });

  afterEach(async () => {
    delete process.env.VAULT_FILE_PATH;
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }
    await fs.rm(vaultPath, { force: true });
  });

  it("delegates signing to the HSM client", async () => {
    const adapter: HSMKeySignerAdapter = {
      sign: vi.fn(async (data: Buffer, keyId: string) => {
        expect(keyId).toBe("hsm-key");
        return Buffer.from(`signed:${data.toString("utf8")}`);
      }),
      getPublicKey: vi.fn(async (keyId: string) => `G${keyId}`),
    };

    const signer = new HsmKeySigner({ adapter, defaultKeyId: "hsm-key" });
    const payload = Buffer.from("hsm-payload");

    await expect(signer.sign(payload, "")).resolves.toEqual(Buffer.from("signed:hsm-payload"));
    expect(adapter.sign).toHaveBeenCalledWith(payload, "hsm-key");
  });

  it("falls back to vault in development when the HSM adapter errors", async () => {
    const keypair = Keypair.random();
    const vault = new VaultService();
    await vault.storeKey(keypair.publicKey(), keypair.secret());

    process.env.NODE_ENV = "development";

    const adapter: HSMKeySignerAdapter = {
      sign: vi.fn(async () => {
        throw new Error("connection refused");
      }),
      getPublicKey: vi.fn(async () => {
        throw new Error("connection refused");
      }),
    };

    const signer = new HsmKeySigner({ adapter, fallbackVault: vault });
    const payload = Buffer.from("fallback-payload");

    const signature = await signer.sign(payload, keypair.publicKey());

    expect(signature).toBeInstanceOf(Buffer);
    expect(signature.length).toBe(64);
    expect(keypair.verify(payload, signature)).toBe(true);
  });
});
