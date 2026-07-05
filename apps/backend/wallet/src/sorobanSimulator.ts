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

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value || value.trim() === "") return fallback;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && Number.isInteger(n) ? n : fallback;
}

export function readSorobanRpcConfig(): SorobanRpcConfig {
  const rawUrl = process.env.SOROBAN_RPC_URL;
  const rpcUrl = rawUrl && rawUrl.trim() !== "" ? rawUrl.trim() : "https://soroban-testnet.stellar.org";
  return {
    rpcUrl,
    timeoutMs: parsePositiveInt(process.env.SOROBAN_RPC_TIMEOUT_MS, DEFAULT_RPC_TIMEOUT_MS),
    maxRetries: parsePositiveInt(process.env.SOROBAN_RPC_MAX_RETRIES, DEFAULT_MAX_RETRIES),
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
    let lastError: unknown;
    const maxAttempts = 1 + this.config.maxRetries;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const simulation = await this.rpcServer.simulateTransaction(transaction);
        return simulation;
      } catch (error) {
        lastError = error;
        if (attempt < maxAttempts) {
          console.warn(`Simulation attempt ${attempt}/${maxAttempts} failed, retrying...`, error);
        } else {
          console.error(`Simulation failed after ${maxAttempts} attempts:`, error);
        }
      }
    }

    throw lastError;
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
