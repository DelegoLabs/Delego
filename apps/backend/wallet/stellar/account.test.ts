import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  Account,
  Asset,
  Keypair,
  Networks,
  Operation,
  Transaction,
  TransactionBuilder,
} from "@stellar/stellar-sdk";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { vaultService } from "../src/vault.js";
import { signMultisigTx } from "./account.js";

let vaultDir: string | undefined;
const originalNetwork = process.env.STELLAR_NETWORK;
const originalVaultFilePath = process.env.VAULT_FILE_PATH;

function buildPaymentEnvelope(source: Keypair): string {
  const destination = Keypair.random();
  const tx = new TransactionBuilder(new Account(source.publicKey(), "1"), {
    fee: "100",
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(
      Operation.payment({
        destination: destination.publicKey(),
        asset: Asset.native(),
        amount: "1",
      })
    )
    .setTimeout(30)
    .build();

  return tx.toEnvelope().toXDR("base64");
}

function parseTransaction(xdr: string): Transaction {
  const parsed = TransactionBuilder.fromXDR(xdr, Networks.TESTNET);
  if (!(parsed instanceof Transaction)) {
    throw new Error("Expected a standard Stellar transaction envelope");
  }
  return parsed;
}

function expectValidSignature(tx: Transaction, signer: Keypair): void {
  const signature = tx.signatures.find((candidate) => (
    Buffer.compare(candidate.hint(), signer.signatureHint()) === 0
  ));

  expect(signature).toBeDefined();
  expect(signer.verify(tx.hash(), signature!.signature())).toBe(true);
}

beforeEach(async () => {
  vaultDir = await mkdtemp(join(tmpdir(), "delego-wallet-vault-"));
  process.env.VAULT_FILE_PATH = join(vaultDir, "vault.json");
  process.env.STELLAR_NETWORK = "testnet";
});

afterEach(async () => {
  if (vaultDir) {
    await rm(vaultDir, { recursive: true, force: true });
  }
  vaultDir = undefined;

  if (originalVaultFilePath === undefined) {
    delete process.env.VAULT_FILE_PATH;
  } else {
    process.env.VAULT_FILE_PATH = originalVaultFilePath;
  }

  if (originalNetwork === undefined) {
    delete process.env.STELLAR_NETWORK;
  } else {
    process.env.STELLAR_NETWORK = originalNetwork;
  }
});

describe("signMultisigTx", () => {
  it("signs a transaction with a single vault-managed key", async () => {
    const signer = Keypair.random();
    await vaultService.storeKey(signer.publicKey(), signer.secret());

    const result = await signMultisigTx({
      xdr: buildPaymentEnvelope(signer),
      signerKeyIds: [signer.publicKey()],
    });

    const tx = parseTransaction(result.signedXdr);
    expect(result).toMatchObject({
      signerCount: 1,
      thresholdMet: true,
    });
    expect(tx.signatures).toHaveLength(1);
    expectValidSignature(tx, signer);
  });

  it("appends multiple deterministic signatures to the envelope", async () => {
    const source = Keypair.random();
    const coSigner = Keypair.random();
    await vaultService.storeKey(source.publicKey(), source.secret());
    await vaultService.storeKey(coSigner.publicKey(), coSigner.secret());

    const result = await signMultisigTx({
      xdr: buildPaymentEnvelope(source),
      signerKeyIds: [source.publicKey(), coSigner.publicKey()],
      requiredWeight: 2,
    });

    const tx = parseTransaction(result.signedXdr);
    expect(result).toEqual({
      signedXdr: result.signedXdr,
      signerCount: 2,
      thresholdMet: true,
    });
    expect(tx.signatures).toHaveLength(2);
    expect(Buffer.compare(tx.signatures[0].hint(), source.signatureHint())).toBe(0);
    expect(Buffer.compare(tx.signatures[1].hint(), coSigner.signatureHint())).toBe(0);
    expectValidSignature(tx, source);
    expectValidSignature(tx, coSigner);
  });

  it("does not duplicate an existing valid signer signature on retry", async () => {
    const signer = Keypair.random();
    await vaultService.storeKey(signer.publicKey(), signer.secret());

    const first = await signMultisigTx({
      xdr: buildPaymentEnvelope(signer),
      signerKeyIds: [signer.publicKey()],
    });
    const second = await signMultisigTx({
      xdr: first.signedXdr,
      signerKeyIds: [signer.publicKey()],
    });

    const tx = parseTransaction(second.signedXdr);
    expect(tx.signatures).toHaveLength(1);
    expect(second.signerCount).toBe(1);
    expect(second.thresholdMet).toBe(true);
    expectValidSignature(tx, signer);
  });

  it("rejects impossible threshold requirements before returning a signed XDR", async () => {
    const signer = Keypair.random();
    await vaultService.storeKey(signer.publicKey(), signer.secret());

    await expect(signMultisigTx({
      xdr: buildPaymentEnvelope(signer),
      signerKeyIds: [signer.publicKey()],
      requiredWeight: 2,
    })).rejects.toThrow("Multisig threshold cannot be met with 1 signer(s)");
  });
});
