import { describe, it, expect, vi, beforeEach } from "vitest";
import { validatePayoutAddressFormat, validatePayoutAddressOnNetwork } from "./payoutAddress";

const VALID_ACCOUNT = "GDVEU3DD4KOFECV66VIHWEZOYX4ZKR3WV27L464SIIPOU2IUI3JCZA57";
const VALID_CONTRACT = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP";

const mockGetAccount = vi.fn();
vi.mock("@stellar/stellar-sdk", async () => {
  const actual = await vi.importActual<typeof import("@stellar/stellar-sdk")>("@stellar/stellar-sdk");
  return {
    ...actual,
    rpc: {
      ...actual.rpc,
      Server: vi.fn().mockImplementation(() => ({
        getAccount: mockGetAccount,
      })),
    },
  };
});

const NETWORK = { sorobanRpcUrl: "https://soroban-testnet.stellar.org", label: "Testnet" };

describe("validatePayoutAddressFormat (#791)", () => {
  it("accepts a well-formed account address", () => {
    expect(validatePayoutAddressFormat(VALID_ACCOUNT)).toEqual({ valid: true });
  });

  it("rejects an empty address", () => {
    expect(validatePayoutAddressFormat("")).toEqual({
      valid: false,
      error: "Enter your Stellar payout address.",
    });
  });

  it("rejects a secret key with a dedicated warning", () => {
    const result = validatePayoutAddressFormat("SDNBUFPFKMGV3AVDWCF25EK55MPCWY7QCPQ2LFAQJEIYVOJF2QY7GSY7");
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/never share it/);
  });

  it("rejects a contract address — a payout address must be a plain account", () => {
    const result = validatePayoutAddressFormat(VALID_CONTRACT);
    expect(result.valid).toBe(false);
  });

  it("rejects a malformed address", () => {
    const result = validatePayoutAddressFormat("GARBAGE");
    expect(result.valid).toBe(false);
  });
});

describe("validatePayoutAddressOnNetwork (#791)", () => {
  beforeEach(() => {
    mockGetAccount.mockReset();
  });

  it("short-circuits on a format error without calling the network", async () => {
    const result = await validatePayoutAddressOnNetwork("", NETWORK);
    expect(result.valid).toBe(false);
    expect(mockGetAccount).not.toHaveBeenCalled();
  });

  it("is valid when the account exists on the network", async () => {
    mockGetAccount.mockResolvedValue({ accountId: () => VALID_ACCOUNT });
    const result = await validatePayoutAddressOnNetwork(VALID_ACCOUNT, NETWORK);
    expect(result).toEqual({ valid: true });
    expect(mockGetAccount).toHaveBeenCalledWith(VALID_ACCOUNT);
  });

  it("reports an unfunded address distinctly from a network failure", async () => {
    mockGetAccount.mockRejectedValue(new Error("Account not found"));
    const result = await validatePayoutAddressOnNetwork(VALID_ACCOUNT, NETWORK);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/isn't funded on Testnet/);
  });

  it("reports a generic network problem when the failure isn't a not-found", async () => {
    mockGetAccount.mockRejectedValue(new Error("fetch failed"));
    const result = await validatePayoutAddressOnNetwork(VALID_ACCOUNT, NETWORK);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/Couldn't reach the network/);
  });
});
