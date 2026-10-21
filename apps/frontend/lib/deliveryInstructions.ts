import { z } from "zod";

/**
 * Encrypted delivery instructions (#1005).
 *
 * Buyers in gated communities can leave access instructions (gate code,
 * apartment buzzer) at checkout. The note is sealed in the browser for the
 * recipient merchant before it is attached to the order, so neither the
 * gateway nor anyone else on the path ever sees the plaintext.
 *
 * The scheme mirrors `encryptKycDocument` in `lib/kycUpload.ts`: a fresh
 * AES-256-GCM key encrypts the note and is wrapped with the merchant's
 * RSA-OAEP (SHA-256) public key, so only the holder of the matching private
 * key can read it. The base64 helpers are duplicated rather than imported to
 * keep this module free of the KYC client and its environment lookup.
 */

/** Longest note a buyer can submit, in characters after trimming. */
export const DELIVERY_INSTRUCTIONS_MAX_LENGTH = 500;

/** Algorithm tag carried in the envelope, same scheme as the KYC upload. */
export const DELIVERY_NOTE_ALGORITHM = "AES-256-GCM+RSA-OAEP-256";

/** Current envelope version. */
export const DELIVERY_NOTE_ENVELOPE_VERSION = 1;

/**
 * Value stored in `recipientInstructions`. The field never carries the
 * buyer's text: it only tells the merchant that sealed instructions are
 * attached, and the real content lives in `encryptedPayload`.
 */
export const ENCRYPTED_INSTRUCTIONS_LABEL = "encrypted";

/** Smallest RSA modulus accepted for a merchant delivery key. */
const MIN_RSA_MODULUS_BITS = 2048;

export interface EncryptedDeliveryNote {
  recipientInstructions: string;
  merchantPublicKey: string;
  encryptedPayload: string;
}

/** Order metadata entry carrying the sealed note. */
export interface DeliveryNoteOrderMetadata {
  encryptedDeliveryNote: EncryptedDeliveryNote;
}

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

/**
 * Decoded form of `encryptedPayload`: everything the merchant needs to
 * decrypt the note with its private key.
 */
export const DeliveryNoteEnvelopeSchema = z
  .object({
    v: z.literal(DELIVERY_NOTE_ENVELOPE_VERSION),
    alg: z.literal(DELIVERY_NOTE_ALGORITHM),
    /** AES-GCM nonce (12 bytes), base64. */
    iv: z.string().regex(BASE64),
    /** AES-256 key wrapped with the merchant's RSA-OAEP key, base64. */
    key: z.string().regex(BASE64),
    /** AES-GCM ciphertext with its authentication tag, base64. */
    ct: z.string().regex(BASE64),
  })
  .strict();

export type DeliveryNoteEnvelope = z.infer<typeof DeliveryNoteEnvelopeSchema>;

export const EncryptedDeliveryNoteSchema = z
  .object({
    recipientInstructions: z.literal(ENCRYPTED_INSTRUCTIONS_LABEL),
    merchantPublicKey: z.string().min(1),
    encryptedPayload: z.string().regex(BASE64),
  })
  .strict();

export type DeliveryInstructionsErrorCode =
  | "empty"
  | "too_long"
  | "invalid_key"
  | "invalid_payload"
  | "unavailable";

export class DeliveryInstructionsError extends Error {
  readonly code: DeliveryInstructionsErrorCode;

  constructor(code: DeliveryInstructionsErrorCode, message: string) {
    super(message);
    this.name = "DeliveryInstructionsError";
    this.code = code;
  }
}

function requireCrypto(): Crypto {
  const crypto =
    typeof globalThis !== "undefined" ? globalThis.crypto : undefined;
  if (!crypto?.subtle) {
    throw new DeliveryInstructionsError(
      "unavailable",
      "Secure encryption is unavailable in this browser."
    );
  }
  return crypto;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function fromBase64(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Trims the buyer's note and enforces the length cap. Throws a
 * {@link DeliveryInstructionsError} for an empty or oversized note.
 */
export function normalizeDeliveryInstructions(instructions: string): string {
  const trimmed = instructions.trim();
  if (!trimmed) {
    throw new DeliveryInstructionsError(
      "empty",
      "Enter delivery instructions before submitting."
    );
  }
  if (trimmed.length > DELIVERY_INSTRUCTIONS_MAX_LENGTH) {
    throw new DeliveryInstructionsError(
      "too_long",
      `Delivery instructions are limited to ${DELIVERY_INSTRUCTIONS_MAX_LENGTH} characters.`
    );
  }
  return trimmed;
}

/**
 * Accepts the merchant key as bare base64 SPKI or as a PEM
 * `PUBLIC KEY` block and returns the bare base64 form.
 */
export function normalizeMerchantPublicKey(merchantPublicKey: string): string {
  return merchantPublicKey
    .replace(/-----(BEGIN|END) PUBLIC KEY-----/g, "")
    .replace(/\s+/g, "");
}

async function importMerchantKey(
  crypto: Crypto,
  spkiBase64: string
): Promise<CryptoKey> {
  if (!spkiBase64) {
    throw new DeliveryInstructionsError(
      "invalid_key",
      "This merchant has not published a delivery key."
    );
  }
  let rsaKey: CryptoKey;
  try {
    rsaKey = await crypto.subtle.importKey(
      "spki",
      fromBase64(spkiBase64) as unknown as BufferSource,
      { name: "RSA-OAEP", hash: "SHA-256" },
      false,
      ["encrypt"]
    );
  } catch {
    throw new DeliveryInstructionsError(
      "invalid_key",
      "The merchant's delivery key is not a valid RSA-OAEP public key."
    );
  }
  const { modulusLength } = rsaKey.algorithm as RsaHashedKeyAlgorithm;
  if (!modulusLength || modulusLength < MIN_RSA_MODULUS_BITS) {
    throw new DeliveryInstructionsError(
      "invalid_key",
      `The merchant's delivery key must be at least ${MIN_RSA_MODULUS_BITS} bits.`
    );
  }
  return rsaKey;
}

/**
 * Encrypts the buyer's delivery instructions for the recipient merchant.
 *
 * A fresh AES-256-GCM key and 12-byte nonce are generated for every note;
 * the AES key is wrapped with the merchant's RSA-OAEP public key. The
 * returned `encryptedPayload` is base64 of the JSON envelope
 * `{ v, alg, iv, key, ct }` described by {@link DeliveryNoteEnvelopeSchema}.
 * The plaintext is not part of the result.
 */
export async function encryptDeliveryNote(
  instructions: string,
  merchantPublicKey: string
): Promise<EncryptedDeliveryNote> {
  const plaintext = normalizeDeliveryInstructions(instructions);
  const crypto = requireCrypto();
  const spkiBase64 = normalizeMerchantPublicKey(merchantPublicKey);
  const rsaKey = await importMerchantKey(crypto, spkiBase64);

  const aesKey = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt"]
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    aesKey,
    new TextEncoder().encode(plaintext)
  );
  const rawKey = await crypto.subtle.exportKey("raw", aesKey);
  const wrappedKey = await crypto.subtle.encrypt(
    { name: "RSA-OAEP" },
    rsaKey,
    rawKey
  );

  const envelope: DeliveryNoteEnvelope = {
    v: DELIVERY_NOTE_ENVELOPE_VERSION,
    alg: DELIVERY_NOTE_ALGORITHM,
    iv: toBase64(iv),
    key: toBase64(new Uint8Array(wrappedKey)),
    ct: toBase64(new Uint8Array(ciphertext)),
  };

  return {
    recipientInstructions: ENCRYPTED_INSTRUCTIONS_LABEL,
    merchantPublicKey: spkiBase64,
    encryptedPayload: btoa(JSON.stringify(envelope)),
  };
}

/** Decodes and validates an `encryptedPayload` back into its envelope. */
export function parseDeliveryNoteEnvelope(
  encryptedPayload: string
): DeliveryNoteEnvelope {
  let decoded: unknown;
  try {
    decoded = JSON.parse(atob(encryptedPayload));
  } catch {
    decoded = null;
  }
  const parsed = DeliveryNoteEnvelopeSchema.safeParse(decoded);
  if (!parsed.success) {
    throw new DeliveryInstructionsError(
      "invalid_payload",
      "Encrypted delivery instructions are malformed."
    );
  }
  return parsed.data;
}

/**
 * Builds the order metadata entry for a sealed note. The note is validated
 * first, so a value that is not a well-formed envelope, or that carries
 * anything other than {@link ENCRYPTED_INSTRUCTIONS_LABEL} in
 * `recipientInstructions`, never reaches the order request.
 */
export function formatDeliveryNote(
  note: EncryptedDeliveryNote
): DeliveryNoteOrderMetadata {
  const parsed = EncryptedDeliveryNoteSchema.safeParse(note);
  if (!parsed.success) {
    throw new DeliveryInstructionsError(
      "invalid_payload",
      "Encrypted delivery instructions are malformed."
    );
  }
  parseDeliveryNoteEnvelope(parsed.data.encryptedPayload);
  return { encryptedDeliveryNote: { ...parsed.data } };
}
