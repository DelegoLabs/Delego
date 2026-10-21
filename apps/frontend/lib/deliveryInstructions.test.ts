import { webcrypto } from "node:crypto";
import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  DELIVERY_INSTRUCTIONS_MAX_LENGTH,
  DELIVERY_NOTE_ALGORITHM,
  DeliveryInstructionsError,
  ENCRYPTED_INSTRUCTIONS_LABEL,
  encryptDeliveryNote,
  formatDeliveryNote,
  parseDeliveryNoteEnvelope,
} from "./deliveryInstructions";

// Pin Node's WebCrypto so the test does not depend on what the jsdom
// environment exposes as `globalThis.crypto`.
vi.stubGlobal("crypto", webcrypto);

const GATE_CODE = "Gate code 4821#, buzzer 12B (Résidence Les Pins)";

function fromB64(value: string) {
  return new Uint8Array(Buffer.from(value, "base64"));
}

async function generateMerchantKeys(modulusLength = 2048) {
  const pair = await globalThis.crypto.subtle.generateKey(
    {
      name: "RSA-OAEP",
      modulusLength,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["encrypt", "decrypt"]
  );
  const spki = await globalThis.crypto.subtle.exportKey("spki", pair.publicKey);
  return {
    privateKey: pair.privateKey,
    publicKey: Buffer.from(spki).toString("base64"),
  };
}

/** Decrypts the way merchant tooling would, from the documented envelope only. */
async function decryptAsMerchant(
  privateKey: CryptoKey,
  encryptedPayload: string
): Promise<string> {
  const subtle = globalThis.crypto.subtle;
  const envelope = JSON.parse(
    Buffer.from(encryptedPayload, "base64").toString("utf8")
  ) as { iv: string; key: string; ct: string };
  const rawKey = await subtle.decrypt(
    { name: "RSA-OAEP" },
    privateKey,
    fromB64(envelope.key)
  );
  const aesKey = await subtle.importKey(
    "raw",
    rawKey,
    { name: "AES-GCM" },
    false,
    ["decrypt"]
  );
  const plaintext = await subtle.decrypt(
    { name: "AES-GCM", iv: fromB64(envelope.iv) },
    aesKey,
    fromB64(envelope.ct)
  );
  return new TextDecoder().decode(plaintext);
}

let merchant: Awaited<ReturnType<typeof generateMerchantKeys>>;

beforeAll(async () => {
  merchant = await generateMerchantKeys();
});

describe("encryptDeliveryNote (#1005)", () => {
  it("seals the note so only the merchant's private key can read it", async () => {
    const note = await encryptDeliveryNote(GATE_CODE, merchant.publicKey);

    expect(note.recipientInstructions).toBe(ENCRYPTED_INSTRUCTIONS_LABEL);
    expect(note.merchantPublicKey).toBe(merchant.publicKey);

    const envelope = parseDeliveryNoteEnvelope(note.encryptedPayload);
    expect(envelope.v).toBe(1);
    expect(envelope.alg).toBe(DELIVERY_NOTE_ALGORITHM);
    expect(fromB64(envelope.iv)).toHaveLength(12);
    // RSA-OAEP output is the size of the 2048-bit modulus.
    expect(fromB64(envelope.key)).toHaveLength(256);

    await expect(
      decryptAsMerchant(merchant.privateKey, note.encryptedPayload)
    ).resolves.toBe(GATE_CODE);
  });

  it("cannot be opened with another merchant's key", async () => {
    const other = await generateMerchantKeys();
    const note = await encryptDeliveryNote(GATE_CODE, merchant.publicKey);

    await expect(
      decryptAsMerchant(other.privateKey, note.encryptedPayload)
    ).rejects.toThrow();
  });

  it("keeps the plaintext out of the note and the order metadata", async () => {
    const note = await encryptDeliveryNote(GATE_CODE, merchant.publicKey);
    const serialized = JSON.stringify(formatDeliveryNote(note));
    const envelopeJson = Buffer.from(note.encryptedPayload, "base64").toString(
      "utf8"
    );

    for (const text of [serialized, envelopeJson]) {
      expect(text).not.toContain(GATE_CODE);
      expect(text).not.toContain("Gate code");
      expect(text).not.toContain("buzzer 12B");
    }
  });

  it("uses a fresh key and nonce for every note", async () => {
    const first = parseDeliveryNoteEnvelope(
      (await encryptDeliveryNote(GATE_CODE, merchant.publicKey))
        .encryptedPayload
    );
    const second = parseDeliveryNoteEnvelope(
      (await encryptDeliveryNote(GATE_CODE, merchant.publicKey))
        .encryptedPayload
    );

    expect(second.iv).not.toBe(first.iv);
    expect(second.key).not.toBe(first.key);
    expect(second.ct).not.toBe(first.ct);
  });

  it("trims the note before encrypting it", async () => {
    const note = await encryptDeliveryNote("  buzzer 12B \n", merchant.publicKey);

    await expect(
      decryptAsMerchant(merchant.privateKey, note.encryptedPayload)
    ).resolves.toBe("buzzer 12B");
  });

  it("rejects empty and oversized instructions", async () => {
    await expect(
      encryptDeliveryNote("", merchant.publicKey)
    ).rejects.toMatchObject({ code: "empty" });
    await expect(
      encryptDeliveryNote("   \n\t ", merchant.publicKey)
    ).rejects.toMatchObject({ code: "empty" });
    await expect(
      encryptDeliveryNote(
        "x".repeat(DELIVERY_INSTRUCTIONS_MAX_LENGTH + 1),
        merchant.publicKey
      )
    ).rejects.toMatchObject({ code: "too_long" });

    await expect(
      encryptDeliveryNote(
        "x".repeat(DELIVERY_INSTRUCTIONS_MAX_LENGTH),
        merchant.publicKey
      )
    ).resolves.toMatchObject({
      recipientInstructions: ENCRYPTED_INSTRUCTIONS_LABEL,
    });
  });

  it("rejects a missing, malformed or weak merchant key", async () => {
    const weak = await generateMerchantKeys(1024);

    for (const key of ["", "   ", "not a key!", btoa("garbage"), weak.publicKey]) {
      const attempt = encryptDeliveryNote(GATE_CODE, key);
      await expect(attempt).rejects.toBeInstanceOf(DeliveryInstructionsError);
      await expect(attempt).rejects.toMatchObject({ code: "invalid_key" });
    }
  });

  it("accepts a PEM encoded merchant key", async () => {
    const pem = [
      "-----BEGIN PUBLIC KEY-----",
      ...(merchant.publicKey.match(/.{1,64}/g) ?? []),
      "-----END PUBLIC KEY-----",
    ].join("\n");

    const note = await encryptDeliveryNote(GATE_CODE, pem);

    expect(note.merchantPublicKey).toBe(merchant.publicKey);
    await expect(
      decryptAsMerchant(merchant.privateKey, note.encryptedPayload)
    ).resolves.toBe(GATE_CODE);
  });
});

describe("formatDeliveryNote (#1005)", () => {
  it("builds the order metadata entry for a sealed note", async () => {
    const note = await encryptDeliveryNote(GATE_CODE, merchant.publicKey);

    expect(formatDeliveryNote(note)).toEqual({ encryptedDeliveryNote: note });
  });

  it("refuses a note that carries plaintext or a malformed payload", async () => {
    const note = await encryptDeliveryNote(GATE_CODE, merchant.publicKey);

    expect(() =>
      formatDeliveryNote({ ...note, recipientInstructions: GATE_CODE })
    ).toThrow(DeliveryInstructionsError);
    expect(() =>
      formatDeliveryNote({ ...note, encryptedPayload: btoa("{}") })
    ).toThrow(DeliveryInstructionsError);
    expect(() =>
      formatDeliveryNote({ ...note, encryptedPayload: btoa(GATE_CODE) })
    ).toThrow(DeliveryInstructionsError);
    expect(() => parseDeliveryNoteEnvelope("%%%")).toThrow(
      DeliveryInstructionsError
    );
  });
});
