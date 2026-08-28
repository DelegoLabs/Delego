import { describe, it, expect } from "vitest";
import {
  Address,
  BASE_FEE,
  Contract,
  Keypair,
  Networks,
  Account,
  StrKey,
  TransactionBuilder,
  nativeToScVal,
} from "@stellar/stellar-sdk";
import {
  decodeTransactionPreview,
  truncateAddress,
} from "./decodeTransactionPreview";

// Golden fixtures: real transactions built with the SDK (not hand-written
// XDR strings) so the decoder is exercised against genuinely valid,
// checksummed envelopes — matching the issue's "golden XDR fixtures" ask.

const SOURCE = Keypair.fromSecret(
  "SBUCRG645IHKH2FRIP6KL5U2IV643HK5LLF3Q7B3QWMFKXAT4REW76MX"
);
const RECIPIENT = "GBZH4MBWR3TBGRKE33DXVCMZKPCOLHYQOAFB2GNFY57ETYBTBQPLVLOD";
const ESCROW_CONTRACT_ID = StrKey.encodeContract(Buffer.alloc(32, 7));
const PERMISSIONS_CONTRACT_ID = StrKey.encodeContract(Buffer.alloc(32, 9));

function buildTx(
  contractId: string,
  method: string,
  args: ReturnType<typeof nativeToScVal>[]
) {
  const account = new Account(SOURCE.publicKey(), "1");
  const contract = new Contract(contractId);
  const op = contract.call(method, ...args);
  return new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(op)
    .setTimeout(30)
    .build();
}

describe("decodeTransactionPreview", () => {
  it("produces an exact-match summary for an escrow release", () => {
    const tx = buildTx(ESCROW_CONTRACT_ID, "release", [
      new Address(RECIPIENT).toScVal(),
      nativeToScVal(452000000n, { type: "i128" }),
    ]);

    const preview = decodeTransactionPreview(tx.toXDR(), Networks.TESTNET);

    expect(preview.networkId).toBe("testnet");
    expect(preview.operations).toHaveLength(1);
    expect(preview.operations[0]).toMatchObject({
      kind: "escrow_release",
      recipient: RECIPIENT,
      amount: "45.2",
      asset: "XLM",
      summary: `Release 45.2 XLM from escrow to ${truncateAddress(RECIPIENT)}`,
    });
  });

  it("produces an exact-match summary for a permission spend", () => {
    const tx = buildTx(PERMISSIONS_CONTRACT_ID, "spend", [
      new Address(RECIPIENT).toScVal(),
      nativeToScVal(10_000_000n, { type: "i128" }),
    ]);

    const preview = decodeTransactionPreview(tx.toXDR(), Networks.TESTNET);

    expect(preview.operations[0]).toMatchObject({
      kind: "permission_spend",
      spender: RECIPIENT,
      amount: "1",
    });
  });

  it("formats a whole-number amount without a trailing decimal point", () => {
    const tx = buildTx(ESCROW_CONTRACT_ID, "release", [
      new Address(RECIPIENT).toScVal(),
      nativeToScVal(100_000_000n, { type: "i128" }),
    ]);

    const preview = decodeTransactionPreview(tx.toXDR(), Networks.TESTNET);
    expect(preview.operations[0]).toMatchObject({ amount: "10" });
  });

  it("falls back honestly for an unrecognized contract method", () => {
    const tx = buildTx(ESCROW_CONTRACT_ID, "some_future_method", [
      nativeToScVal(1n, { type: "i128" }),
    ]);

    const preview = decodeTransactionPreview(tx.toXDR(), Networks.TESTNET);

    expect(preview.operations[0]).toMatchObject({
      kind: "unrecognized",
      functionName: "some_future_method",
    });
    // Never guesses — no amount/recipient claimed for an unknown method.
    expect(preview.operations[0]).not.toHaveProperty("amount");
  });

  it("falls back honestly for a known method with too few arguments", () => {
    const tx = buildTx(ESCROW_CONTRACT_ID, "release", [
      new Address(RECIPIENT).toScVal(),
    ]);

    const preview = decodeTransactionPreview(tx.toXDR(), Networks.TESTNET);
    expect(preview.operations[0].kind).toBe("unrecognized");
  });

  it("reports the source account and fee", () => {
    const tx = buildTx(ESCROW_CONTRACT_ID, "release", [
      new Address(RECIPIENT).toScVal(),
      nativeToScVal(1n, { type: "i128" }),
    ]);

    const preview = decodeTransactionPreview(tx.toXDR(), Networks.TESTNET);
    expect(preview.sourceAccount).toBe(SOURCE.publicKey());
    expect(preview.fee).toBe(BASE_FEE);
  });

  it("returns null memo when none is set", () => {
    const tx = buildTx(ESCROW_CONTRACT_ID, "release", [
      new Address(RECIPIENT).toScVal(),
      nativeToScVal(1n, { type: "i128" }),
    ]);

    const preview = decodeTransactionPreview(tx.toXDR(), Networks.TESTNET);
    expect(preview.memo).toBeNull();
  });

  it("resolves networkId to null for an unrecognized passphrase", () => {
    const account = new Account(SOURCE.publicKey(), "1");
    const contract = new Contract(ESCROW_CONTRACT_ID);
    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: "Some custom network ; 2026",
    })
      .addOperation(
        contract.call(
          "release",
          new Address(RECIPIENT).toScVal(),
          nativeToScVal(1n, { type: "i128" })
        )
      )
      .setTimeout(30)
      .build();

    const preview = decodeTransactionPreview(
      tx.toXDR(),
      "Some custom network ; 2026"
    );
    expect(preview.networkId).toBeNull();
  });

  it("throws on malformed XDR rather than returning a partial/guessed preview", () => {
    expect(() =>
      decodeTransactionPreview("not-valid-xdr", Networks.TESTNET)
    ).toThrow();
  });
});

describe("truncateAddress", () => {
  it("truncates a full Stellar address to prefix…suffix", () => {
    expect(truncateAddress(RECIPIENT)).toBe(
      `${RECIPIENT.slice(0, 4)}…${RECIPIENT.slice(-4)}`
    );
  });

  it("returns short strings unchanged", () => {
    expect(truncateAddress("GABC")).toBe("GABC");
  });
});
