import { describe, it, expect } from "vitest";
import { StrKey } from "@stellar/stellar-sdk";
import {
  filterMerchantRules,
  validateNewRule,
  validateStellarAddress,
  type MerchantFilterRule,
} from "./merchantFilters";

// Fixed, deterministic ed25519 account/secret pair. `Keypair.random()` cannot
// be used here: under jsdom the SDK hands @noble/ed25519 a Buffer from a
// different realm, which it rejects as "not a Uint8Array".
const ACCOUNT = "GDVEU3DD4KOFECV66VIHWEZOYX4ZKR3WV27L464SIIPOU2IUI3JCZA57";
const ACCOUNT_SECRET =
  "SADQOBYHA4DQOBYHA4DQOBYHA4DQOBYHA4DQOBYHA4DQOBYHA4DQP54X";
const CONTRACT = StrKey.encodeContract(Buffer.alloc(32, 3));

describe("validateStellarAddress", () => {
  it("accepts account and contract addresses", () => {
    expect(validateStellarAddress(ACCOUNT).valid).toBe(true);
    expect(validateStellarAddress(`  ${ACCOUNT} `).valid).toBe(true);
    expect(validateStellarAddress(CONTRACT).valid).toBe(true);
  });

  it("explains each failure mode", () => {
    expect(validateStellarAddress("").error).toMatch(/Enter/);
    expect(validateStellarAddress(ACCOUNT_SECRET).error).toMatch(/secret key/);
    expect(validateStellarAddress(ACCOUNT.toLowerCase()).error).toMatch(/upper-case/);
    expect(validateStellarAddress(`X${ACCOUNT.slice(1)}`).error).toMatch(/start with G/);
    expect(validateStellarAddress(`${ACCOUNT.slice(0, 55)}1`).error).toMatch(/2–7/);
    expect(validateStellarAddress(ACCOUNT.slice(0, 50)).error).toMatch(/56 characters.*50/);
  });

  it("catches checksum typos", () => {
    const last = ACCOUNT[55] === "A" ? "B" : "A";
    expect(validateStellarAddress(`${ACCOUNT.slice(0, 55)}${last}`).error).toMatch(/checksum/);
  });
});

const rules: MerchantFilterRule[] = [
  { address: ACCOUNT, merchantName: "Fresh Grocer", policy: "allow", addedAt: "2026-09-01" },
  {
    address: CONTRACT,
    merchantName: "Shady Shop",
    policy: "block",
    addedAt: "2026-09-02",
    reason: "Counterfeit goods",
  },
];

describe("validateNewRule", () => {
  it("rejects duplicates", () => {
    expect(validateNewRule(ACCOUNT, rules).error).toMatch(/already on your allowlist/);
  });
});

describe("filterMerchantRules", () => {
  it("filters by policy tag and search text", () => {
    expect(filterMerchantRules(rules, "", "block")).toHaveLength(1);
    expect(filterMerchantRules(rules, "counterfeit")).toEqual([rules[1]]);
    expect(filterMerchantRules(rules, "grocer", "block")).toHaveLength(0);
    expect(filterMerchantRules(rules, ACCOUNT.slice(0, 8).toLowerCase())).toEqual([rules[0]]);
  });
});
