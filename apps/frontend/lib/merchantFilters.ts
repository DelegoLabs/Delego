/**
 * Merchant allowlist / blocklist rules (#717).
 */

import { StrKey } from "@stellar/stellar-sdk";

export interface MerchantFilterRule {
  address: string;
  merchantName?: string;
  policy: "allow" | "block";
  addedAt: string;
  reason?: string;
}

export type MerchantPolicyFilter = "all" | MerchantFilterRule["policy"];

export interface AddressValidation {
  valid: boolean;
  error?: string;
}

const STRKEY_LENGTH = 56;
const MUXED_LENGTH = 69;

/**
 * Validates a merchant's Stellar address (G… account, M… muxed account or
 * C… contract) and explains what's wrong when it isn't one.
 */
export function validateStellarAddress(raw: string): AddressValidation {
  const address = raw.trim();
  if (!address) {
    return { valid: false, error: "Enter the merchant's Stellar address." };
  }
  if (address.startsWith("S")) {
    return {
      valid: false,
      error:
        "That looks like a secret key — never share it. Enter the merchant's public address, which starts with G.",
    };
  }
  if (address !== address.toUpperCase()) {
    return { valid: false, error: "Stellar addresses use upper-case letters only." };
  }
  if (!/^[GMC]/.test(address)) {
    return {
      valid: false,
      error: "Stellar addresses start with G (account), M (muxed account) or C (contract).",
    };
  }
  if (!/^[A-Z2-7]+$/.test(address)) {
    return {
      valid: false,
      error: "The address contains characters Stellar doesn't use — only A–Z and 2–7 are allowed.",
    };
  }
  const expectedLength = address.startsWith("M") ? MUXED_LENGTH : STRKEY_LENGTH;
  if (address.length !== expectedLength) {
    return {
      valid: false,
      error: `Stellar addresses are ${expectedLength} characters long — this one has ${address.length}.`,
    };
  }
  const checksumOk =
    StrKey.isValidEd25519PublicKey(address) ||
    StrKey.isValidMed25519PublicKey(address) ||
    StrKey.isValidContract(address);
  if (!checksumOk) {
    return {
      valid: false,
      error: "The address checksum doesn't match — check it for typos or copy it again.",
    };
  }
  return { valid: true };
}

/** Validation for a new rule, including duplicate detection. */
export function validateNewRule(
  address: string,
  existing: MerchantFilterRule[]
): AddressValidation {
  const base = validateStellarAddress(address);
  if (!base.valid) return base;
  const normalized = address.trim();
  const duplicate = existing.find((rule) => rule.address === normalized);
  if (duplicate) {
    return {
      valid: false,
      error: `This merchant is already on your ${
        duplicate.policy === "allow" ? "allowlist" : "blocklist"
      }.`,
    };
  }
  return { valid: true };
}

/** Filters by policy tag and a case-insensitive search over address, name and reason. */
export function filterMerchantRules(
  rules: MerchantFilterRule[],
  query: string,
  policy: MerchantPolicyFilter = "all"
): MerchantFilterRule[] {
  const needle = query.trim().toLowerCase();
  return rules.filter((rule) => {
    if (policy !== "all" && rule.policy !== policy) return false;
    if (!needle) return true;
    return [rule.address, rule.merchantName, rule.reason]
      .filter((v): v is string => Boolean(v))
      .some((v) => v.toLowerCase().includes(needle));
  });
}

export function shortenAddress(address: string): string {
  return address.length <= 12 ? address : `${address.slice(0, 6)}…${address.slice(-6)}`;
}
