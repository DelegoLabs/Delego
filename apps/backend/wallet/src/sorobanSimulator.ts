import {
  Transaction,
  // @ts-ignore
  xdr,
  rpc as SorobanRpc,
} from "@stellar/stellar-sdk";

type SimulateTransactionResponse = SorobanRpc.Api.SimulateTransactionResponse;

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

  constructor(rpcUrl: string) {
    this.rpcServer = new SorobanRpc.Server(rpcUrl);
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
