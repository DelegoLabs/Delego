import { describe, it, expect, vi, beforeEach } from "vitest";
import { SorobanTransactionSimulator, readSorobanRpcConfig } from "./sorobanSimulator.js";

const mockSimulateTransaction = vi.fn();
const mockServerCtor = vi.fn();

vi.mock("@stellar/stellar-sdk", () => ({
  rpc: {
    Server: mockServerCtor,
    Api: {
      isSimulationSuccess: (res: any) => res.success === true,
      isSimulationError: (res: any) => res.success === false && !!res.error,
    },
  },
  Transaction: vi.fn(),
  xdr: {},
}));

describe("readSorobanRpcConfig", () => {
  beforeEach(() => {
    vi.stubEnv("SOROBAN_RPC_URL", "");
    vi.stubEnv("SOROBAN_RPC_TIMEOUT_MS", "");
    vi.stubEnv("SOROBAN_RPC_MAX_RETRIES", "");
  });

  it("returns defaults when no env vars are set", () => {
    const config = readSorobanRpcConfig();
    expect(config.rpcUrl).toBe("https://soroban-testnet.stellar.org");
    expect(config.timeoutMs).toBe(30_000);
    expect(config.maxRetries).toBe(3);
  });

  it("reads values from environment variables", () => {
    vi.stubEnv("SOROBAN_RPC_URL", "https://custom-rpc.example.com");
    vi.stubEnv("SOROBAN_RPC_TIMEOUT_MS", "15000");
    vi.stubEnv("SOROBAN_RPC_MAX_RETRIES", "5");

    const config = readSorobanRpcConfig();
    expect(config.rpcUrl).toBe("https://custom-rpc.example.com");
    expect(config.timeoutMs).toBe(15_000);
    expect(config.maxRetries).toBe(5);
  });

  it("coerces string values to numbers for timeoutMs and maxRetries", () => {
    vi.stubEnv("SOROBAN_RPC_TIMEOUT_MS", "10000");
    vi.stubEnv("SOROBAN_RPC_MAX_RETRIES", "2");

    const config = readSorobanRpcConfig();
    expect(config.timeoutMs).toBe(10_000);
    expect(config.maxRetries).toBe(2);
    expect(typeof config.timeoutMs).toBe("number");
    expect(typeof config.maxRetries).toBe("number");
  });
});

describe("SorobanTransactionSimulator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function makeServerInstance() {
    const instance = { simulateTransaction: mockSimulateTransaction };
    mockServerCtor.mockReturnValue(instance);
    return instance;
  }

  it("creates an rpc.Server with the configured URL and timeout", () => {
    makeServerInstance();
    const config = { rpcUrl: "https://rpc.example.com", timeoutMs: 5000, maxRetries: 3 };
    new SorobanTransactionSimulator(config);

    expect(mockServerCtor).toHaveBeenCalledWith("https://rpc.example.com", { timeout: 5000 });
  });

  it("stores the config on the instance", () => {
    makeServerInstance();
    const config = { rpcUrl: "https://rpc.example.com", timeoutMs: 5000, maxRetries: 3 };
    const simulator = new SorobanTransactionSimulator(config);

    expect(simulator.config).toEqual(config);
  });

  it("simulateTransaction resolves on success", async () => {
    const server = makeServerInstance();
    const simulator = new SorobanTransactionSimulator({
      rpcUrl: "https://rpc.example.com",
      timeoutMs: 5000,
      maxRetries: 3,
    });

    const fakeTx = {} as any;
    const mockResponse = { success: true, minResourceFee: "100" };
    server.simulateTransaction.mockResolvedValue(mockResponse);

    const result = await simulator.simulateTransaction(fakeTx);
    expect(result).toEqual(mockResponse);
  });

  it("simulateTransaction rejects on timeout error", async () => {
    const server = makeServerInstance();
    const simulator = new SorobanTransactionSimulator({
      rpcUrl: "https://rpc.example.com",
      timeoutMs: 100,
      maxRetries: 3,
    });

    const fakeTx = {} as any;
    server.simulateTransaction.mockRejectedValue(
      new Error("request timed out after 100ms")
    );

    await expect(simulator.simulateTransaction(fakeTx)).rejects.toThrow(
      "request timed out after 100ms"
    );
  });

  it("simulateTransaction rejects on network error", async () => {
    const server = makeServerInstance();
    const simulator = new SorobanTransactionSimulator({
      rpcUrl: "https://rpc.example.com",
      timeoutMs: 5000,
      maxRetries: 3,
    });

    const fakeTx = {} as any;
    server.simulateTransaction.mockRejectedValue(new Error("network error"));

    await expect(simulator.simulateTransaction(fakeTx)).rejects.toThrow("network error");
  });
});
