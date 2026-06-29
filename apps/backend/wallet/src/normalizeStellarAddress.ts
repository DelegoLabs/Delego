import { StrKey } from "@stellar/stellar-sdk";

export interface NormalizedStellarAddress {
  original: string;
  normalized: string;
  valid: boolean;
}

/**
 * Normalizes a Stellar public key (StrKey) input before validation and persistence.
 * Trims surrounding whitespace and validates via the Stellar SDK StrKey helpers.
 * Secret seeds (`S...`) and malformed or lowercase keys are rejected.
 */
export function normalizeStellarAddress(input: string): NormalizedStellarAddress {
  const original = typeof input === "string" ? input : "";
  const normalized = original.trim();

  if (normalized === "") {
    return { original, normalized: "", valid: false };
  }

  if (StrKey.isValidEd25519SecretSeed(normalized)) {
    return { original, normalized, valid: false };
  }

  if (!StrKey.isValidEd25519PublicKey(normalized)) {
    return { original, normalized, valid: false };
  }

  return { original, normalized, valid: true };
}
