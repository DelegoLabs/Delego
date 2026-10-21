import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useTokenAllowances } from "./useTokenAllowances";
import type { NetworkConfig } from "../../lib/networks";
import type { SpenderContract, TrackedToken } from "./allowanceConstants";
import * as queryModule from "./queryAllowance";
import * as revokeModule from "./revokeAllowance";

const mockNetwork: NetworkConfig = {
  id: "testnet",
  label: "Testnet",
  shortLabel: "TEST",
  freighterNetwork: "TESTNET",
  networkPassphrase: "Test SDF Network ; September 2015",
  horizonUrl: "https://horizon-testnet.stellar.org",
  sorobanRpcUrl: "https://soroban-testnet.stellar.org",
  isLive: false,
};

const mockSpender: SpenderContract = {
  address: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4",
  label: "Escrow Contract",
};

const mockToken: TrackedToken = {
  address: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
  symbol: "USDC",
};

describe("useTokenAllowances hook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty array and does not query when ownerAddress is null", async () => {
    const fetchSpy = vi.spyOn(queryModule, "fetchAllActiveTokenAllowances");
    const { result } = renderHook(() =>
      useTokenAllowances({
        network: mockNetwork,
        ownerAddress: null,
      })
    );

    expect(result.current.allowances).toEqual([]);
    expect(result.current.loading).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("fetches active allowances on mount when ownerAddress is present", async () => {
    const fetchSpy = vi
      .spyOn(queryModule, "fetchAllActiveTokenAllowances")
      .mockResolvedValueOnce([
        {
          tokenAddress: mockToken.address,
          tokenSymbol: mockToken.symbol,
          spenderAddress: mockSpender.address,
          spenderLabel: mockSpender.label,
          allowedAmountStroops: "10000000",
          expirationLedger: 500,
        },
      ]);

    const { result } = renderHook(() =>
      useTokenAllowances({
        network: mockNetwork,
        ownerAddress: "GABC1234",
        spenderContracts: [mockSpender],
        tokens: [mockToken],
      })
    );

    await act(async () => {
      await result.current.refetch();
    });

    expect(result.current.allowances).toHaveLength(1);
    expect(result.current.allowances[0].spenderLabel).toBe("Escrow Contract");
    expect(result.current.allowances[0].allowedAmountStroops).toBe("10000000");
  });

  it("removes row upon successful revocation", async () => {
    const initialEntry = {
      tokenAddress: mockToken.address,
      tokenSymbol: mockToken.symbol,
      spenderAddress: mockSpender.address,
      spenderLabel: mockSpender.label,
      allowedAmountStroops: "10000000",
      expirationLedger: 500,
    };

    vi.spyOn(queryModule, "fetchAllActiveTokenAllowances").mockResolvedValueOnce([
      initialEntry,
    ]);

    const revokeSpy = vi
      .spyOn(revokeModule, "revokeTokenAllowance")
      .mockResolvedValueOnce({ txHash: "mock-tx-hash" });

    const mockSigner = vi.fn().mockResolvedValue("mock-signed-xdr");

    const { result } = renderHook(() =>
      useTokenAllowances({
        network: mockNetwork,
        ownerAddress: "GABC1234",
        spenderContracts: [mockSpender],
        tokens: [mockToken],
        signTransaction: mockSigner,
      })
    );

    await act(async () => {
      await result.current.refetch();
    });

    expect(result.current.allowances).toHaveLength(1);

    await act(async () => {
      await result.current.revokeAllowance(initialEntry);
    });

    expect(revokeSpy).toHaveBeenCalledTimes(1);
    expect(result.current.allowances).toHaveLength(0);
  });
});
