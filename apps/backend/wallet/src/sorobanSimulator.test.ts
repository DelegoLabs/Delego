import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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

  afterEach(() => {
    vi.unstubAllEnvs();
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

  it("treats blank SOROBAN_RPC_URL as unset and uses default", () => {
    vi.stubEnv("SOROBAN_RPC_URL", "   ");

    const config = readSorobanRpcConfig();
    expect(config.rpcUrl).toBe("https://soroban-testnet.stellar.org");
  });

  it("treats blank timeout string as unset and uses default", () => {
    vi.stubEnv("SOROBAN_RPC_TIMEOUT_MS", "");

    const config = readSorobanRpcConfig();
    expect(config.timeoutMs).toBe(30_000);
  });

  it("treats malformed timeout string as unset and uses default", () => {
    vi.stubEnv("SOROBAN_RPC_TIMEOUT_MS", "abc");

    const config = readSorobanRpcConfig();
    expect(config.timeoutMs).toBe(30_000);
  });

  it("treats negative timeout as unset and uses default", () => {
    vi.stubEnv("SOROBAN_RPC_TIMEOUT_MS", "-5000");

    const config = readSorobanRpcConfig();
    expect(config.timeoutMs).toBe(30_000);
  });

  it("treats malformed maxRetries as unset and uses default", () => {
    vi.stubEnv("SOROBAN_RPC_MAX_RETRIES", "not-a-number");

    const config = readSorobanRpcConfig();
    expect(config.maxRetries).toBe(3);
  });

  it("accepts zero for maxRetries", () => {
    vi.stubEnv("SOROBAN_RPC_URL", "https://zero-retry.example.com");
    vi.stubEnv("SOROBAN_RPC_MAX_RETRIES", "0");

    const config = readSorobanRpcConfig();
    expect(config.maxRetries).toBe(0);
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
      maxRetries: 0,
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
      maxRetries: 0,
    });

    const fakeTx = {} as any;
    server.simulateTransaction.mockRejectedValue(new Error("network error"));

    await expect(simulator.simulateTransaction(fakeTx)).rejects.toThrow("network error");
  });

  it("simulateTransaction retries on transient failure and succeeds", async () => {
    const server = makeServerInstance();
    const simulator = new SorobanTransactionSimulator({
      rpcUrl: "https://rpc.example.com",
      timeoutMs: 5000,
      maxRetries: 3,
    });

    const fakeTx = {} as any;
    const successResponse = { success: true, minResourceFee: "100" };
    server.simulateTransaction
      .mockRejectedValueOnce(new Error("timeout"))
      .mockRejectedValueOnce(new Error("network error"))
      .mockResolvedValueOnce(successResponse);

    const result = await simulator.simulateTransaction(fakeTx);
    expect(result).toEqual(successResponse);
    expect(server.simulateTransaction).toHaveBeenCalledTimes(3);
  });

  it("simulateTransaction retries up to maxRetries and then rejects", async () => {
    const server = makeServerInstance();
    const simulator = new SorobanTransactionSimulator({
      rpcUrl: "https://rpc.example.com",
      timeoutMs: 5000,
      maxRetries: 2,
    });

    const fakeTx = {} as any;
    server.simulateTransaction.mockRejectedValue(new Error("persistent timeout"));

    await expect(simulator.simulateTransaction(fakeTx)).rejects.toThrow("persistent timeout");
    expect(server.simulateTransaction).toHaveBeenCalledTimes(2);
  });

  it("simulateTransaction respects maxRetries of 1 (no retry)", async () => {
    const server = makeServerInstance();
    const simulator = new SorobanTransactionSimulator({
      rpcUrl: "https://rpc.example.com",
      timeoutMs: 5000,
      maxRetries: 1,
    });

    const fakeTx = {} as any;
    server.simulateTransaction.mockRejectedValue(new Error("no retry"));

    await expect(simulator.simulateTransaction(fakeTx)).rejects.toThrow("no retry");
    expect(server.simulateTransaction).toHaveBeenCalledTimes(1);
  });
});
