import {
  Transaction,
  // @ts-ignore
  xdr,
  rpc as SorobanRpc,
} from "@stellar/stellar-sdk";

type SimulateTransactionResponse = SorobanRpc.Api.SimulateTransactionResponse;

export interface SorobanRpcConfig {
  rpcUrl: string;
  timeoutMs: number;
  maxRetries: number;
}

const DEFAULT_RPC_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RETRIES = 3;

export function readSorobanRpcConfig(): SorobanRpcConfig {
  return {
    rpcUrl: process.env.SOROBAN_RPC_URL ?? "https://soroban-testnet.stellar.org",
    timeoutMs: Number(process.env.SOROBAN_RPC_TIMEOUT_MS ?? DEFAULT_RPC_TIMEOUT_MS),
    maxRetries: Number(process.env.SOROBAN_RPC_MAX_RETRIES ?? DEFAULT_MAX_RETRIES),
  };
}

export interface SimulationResult {
  success: boolean;
  minResourceFee?: string;
  footprint?: string;
  error?: string;
}

export function mapSimulationResult(
  response: SimulateTransactionResponse
): SimulationResult {
  if (SorobanRpc.Api.isSimulationSuccess(response)) {
    const result: SimulationResult = { success: true };

    if (response.minResourceFee !== undefined) {
      result.minResourceFee = String(response.minResourceFee);
    }

    if (response.transactionData) {
      try {
        const data = response.transactionData.build();
        result.footprint = data.toXDR().toString("base64");
      } catch {
        // footprint extraction failed — leave unset
      }
    }

    return result;
  }

  if (SorobanRpc.Api.isSimulationError(response)) {
    return { success: false, error: response.error };
  }

  return { success: false, error: "Simulation returned an unexpected response" };
}

export class SorobanTransactionSimulator {
  private rpcServer: SorobanRpc.Server;
  public readonly config: SorobanRpcConfig;

  constructor(config: SorobanRpcConfig) {
    this.config = config;
    this.rpcServer = new SorobanRpc.Server(config.rpcUrl, {
      timeout: config.timeoutMs,
    });
  }

  public async simulateTransaction(
    transaction: Transaction
  ): Promise<SimulateTransactionResponse> {
    try {
      const simulation = await this.rpcServer.simulateTransaction(transaction);
      return simulation;
    } catch (error) {
      console.error("Error simulating transaction:", error);
      throw error;
    }
  }

  public extractFeeEstimates(
    simulationResponse: SimulateTransactionResponse
  ): any {
    if (SorobanRpc.Api.isSimulationSuccess(simulationResponse) && simulationResponse.transactionData) {
      const sorobanTransactionData = simulationResponse.transactionData.build();
      const resources = sorobanTransactionData.resources();
      return {
        cpu: resources.instructions().toString(),
        memory: resources.writeBytes().toString(),
      };
    }
    return {};
  }

  // Placeholder for failure detection
  public detectFailureReasons(
    simulationResponse: SimulateTransactionResponse
  ): string[] {
    if (SorobanRpc.Api.isSimulationError(simulationResponse)) {
      return [simulationResponse.error];
    }
    return [];
  }
}
