import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SorobanTransactionSimulator } from "../sorobanSimulator.js";

const { mockSimulateTransaction, mockServerCtor, mockIsSimulationSuccess, mockIsSimulationError } = vi.hoisted(() => ({
  mockSimulateTransaction: vi.fn(),
  mockServerCtor: vi.fn(),
  mockIsSimulationSuccess: vi.fn(),
  mockIsSimulationError: vi.fn(),
}));

vi.mock("@stellar/stellar-sdk", () => ({
  rpc: {
    Server: mockServerCtor,
    Api: {
      isSimulationSuccess: mockIsSimulationSuccess,
      isSimulationError: mockIsSimulationError,
    },
  },
  Transaction: vi.fn(),
  xdr: {},
}));

describe("SorobanTransactionSimulator Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("SOROBAN_RPC_URL", "https://test-rpc.example.com");
    vi.stubEnv("SOROBAN_RPC_TIMEOUT_MS", "10000");
    vi.stubEnv("SOROBAN_RPC_MAX_RETRIES", "2");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  function makeServerInstance() {
    const instance = { simulateTransaction: mockSimulateTransaction };
    mockServerCtor.mockReturnValue(instance);
    return instance;
  }

  it("creates simulator with config from environment", () => {
    makeServerInstance();
    const simulator = new SorobanTransactionSimulator({
      rpcUrl: "https://test-rpc.example.com",
      timeoutMs: 10000,
      maxRetries: 2,
    });

    expect(mockServerCtor).toHaveBeenCalledWith("https://test-rpc.example.com", { timeout: 10000 });
    expect(simulator.config.rpcUrl).toBe("https://test-rpc.example.com");
  });

  it("simulates transaction and returns success response", async () => {
    const server = makeServerInstance();
    const simulator = new SorobanTransactionSimulator({
      rpcUrl: "https://test-rpc.example.com",
      timeoutMs: 10000,
      maxRetries: 2,
    });

    const fakeTx = {} as any;
    const mockResponse = { 
      success: true, 
      minResourceFee: "100",
      transactionData: {
        build: vi.fn().mockReturnValue({
          toXDR: vi.fn().mockReturnValue(Buffer.from("mock-xdr")),
        })
      }
    };
    server.simulateTransaction.mockResolvedValue(mockResponse);
    mockIsSimulationSuccess.mockReturnValue(true);

    const result = await simulator.simulateTransaction(fakeTx);
    expect(result).toEqual(mockResponse);
  });

  it("detects failure reasons from simulation error", async () => {
    makeServerInstance();
    const simulator = new SorobanTransactionSimulator({
      rpcUrl: "https://test-rpc.example.com",
      timeoutMs: 10000,
      maxRetries: 2,
    });

    const mockResponse = { 
      success: false, 
      error: "Contract invocation failed: insufficient funds" 
    };
    mockIsSimulationSuccess.mockReturnValue(false);
    mockIsSimulationError.mockReturnValue(true);

    const reasons = simulator.detectFailureReasons(mockResponse);
    expect(reasons).toEqual(["Contract invocation failed: insufficient funds"]);
  });

  it("extracts fee estimates from successful simulation", async () => {
    makeServerInstance();
    const simulator = new SorobanTransactionSimulator({
      rpcUrl: "https://test-rpc.example.com",
      timeoutMs: 10000,
      maxRetries: 2,
    });

    const mockResources = {
      instructions: vi.fn().mockReturnValue(BigInt(1000)),
      writeBytes: vi.fn().mockReturnValue(BigInt(512)),
    };
    const mockTransactionData = {
      build: vi.fn().mockReturnValue({
        resources: vi.fn().mockReturnValue(mockResources),
      })
    };
    const mockResponse = { 
      success: true, 
      transactionData: mockTransactionData 
    };
    mockIsSimulationSuccess.mockReturnValue(true);

    const estimates = simulator.extractFeeEstimates(mockResponse);
    expect(estimates).toEqual({ cpu: "1000", memory: "512" });
  });

  it("returns empty estimates when simulation fails", async () => {
    makeServerInstance();
    const simulator = new SorobanTransactionSimulator({
      rpcUrl: "https://test-rpc.example.com",
      timeoutMs: 10000,
      maxRetries: 2,
    });

    const mockResponse = { success: false, error: "Failed" };
    mockIsSimulationSuccess.mockReturnValue(false);

    const estimates = simulator.extractFeeEstimates(mockResponse);
    expect(estimates).toEqual({});
  });
});