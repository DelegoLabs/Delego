import type { SorobanSimulationMetrics } from "@delegolabs/types";
import { rpc, TransactionBuilder, Networks } from "@stellar/stellar-sdk";

export const DEFAULT_SOROBAN_RESOURCE_LIMITS = {
  cpuInstructions: 100_000_000, // 100M CPU instructions per transaction
  memoryBytes: 40_000_000,       // 40MB memory
  readBytes: 200_000,            // 200KB read footprint
  writeBytes: 150_000,           // 150KB write footprint
};

export interface SimulateSorobanTransactionOptions {
  rpcUrl: string;
  transactionXdr: string;
}

export interface SorobanSimulationDiagnosticResult {
  metrics: SorobanSimulationMetrics;
  preparedTransactionXdr?: string;
  error?: string;
  warnings: string[];
}

function readResourceValue(value: unknown, receiver: object): number {
  return Number(typeof value === "function" ? Reflect.apply(value, receiver, []) : value ?? 0);
}

export function formatStroopsToXlm(stroopsStr: string): string {
  try {
    const stroops = BigInt(stroopsStr || "0");
    const whole = stroops / 10_000_000n;
    const fraction = stroops % 10_000_000n;
    const paddedFraction = fraction.toString().padStart(7, "0").replace(/0+$/, "");
    return paddedFraction ? `${whole}.${paddedFraction} XLM` : `${whole} XLM`;
  } catch {
    return "0 XLM";
  }
}

export function parseSimulationResponse(
  simResponse: rpc.Api.SimulateTransactionResponse
): SorobanSimulationDiagnosticResult {
  const warnings: string[] = [];

  if (rpc.Api.isSimulationError(simResponse)) {
    const errorMsg = simResponse.error || "Soroban transaction simulation failed on RPC server.";
    return {
      metrics: {
        cpuInstructions: 0,
        memoryBytes: 0,
        minResourceFeeStroops: "0",
        readBytes: 0,
        writeBytes: 0,
        isSimulatedSuccessfully: false,
      },
      error: errorMsg,
      warnings: [],
    };
  }

  const minResourceFeeStroops = simResponse.minResourceFee || "0";
  let cpuInstructions = 0;
  let memoryBytes = 0;

  let readBytes = 0;
  let writeBytes = 0;

  if (simResponse.transactionData) {
    try {
      const txData = simResponse.transactionData.build();
      const resources = txData.resources();
      cpuInstructions = readResourceValue(resources.instructions, resources);
      readBytes = readResourceValue(
        Reflect.get(resources, "diskReadBytes") ?? Reflect.get(resources, "readBytes"),
        resources
      );
      writeBytes = readResourceValue(resources.writeBytes, resources);
      memoryBytes = readBytes + writeBytes;
    } catch {
      // Fallback or ignore extraction errors
    }
  }

  const cpuRatio = cpuInstructions / DEFAULT_SOROBAN_RESOURCE_LIMITS.cpuInstructions;
  if (cpuRatio >= 0.8) {
    const pct = (cpuRatio * 100).toFixed(1);
    warnings.push(
      `CPU instruction usage (${cpuInstructions.toLocaleString()}) is at ${pct}% of maximum limit.`
    );
  }

  let preparedXdr: string | undefined;
  if (simResponse.transactionData) {
    try {
      preparedXdr = simResponse.transactionData.build().toXDR("base64");
    } catch {
      const toXDR = Reflect.get(simResponse.transactionData, "toXDR");
      preparedXdr = typeof toXDR === "function"
        ? toXDR.call(simResponse.transactionData, "base64")
        : String(simResponse.transactionData);
    }
  }

  return {
    metrics: {
      cpuInstructions,
      memoryBytes,
      minResourceFeeStroops: minResourceFeeStroops.toString(),
      readBytes,
      writeBytes,
      isSimulatedSuccessfully: true,
    },
    preparedTransactionXdr: preparedXdr,
    warnings,
  };
}

export async function simulateSorobanTransaction(
  options: SimulateSorobanTransactionOptions
): Promise<SorobanSimulationDiagnosticResult> {
  const server = new rpc.Server(options.rpcUrl);
  const tx = TransactionBuilder.fromXDR(options.transactionXdr, Networks.TESTNET);

  try {
    const simResponse = await server.simulateTransaction(tx);
    return parseSimulationResponse(simResponse);
  } catch (err) {
    return {
      metrics: {
        cpuInstructions: 0,
        memoryBytes: 0,
        minResourceFeeStroops: "0",
        readBytes: 0,
        writeBytes: 0,
        isSimulatedSuccessfully: false,
      },
      error: err instanceof Error ? err.message : "Failed to connect to Soroban RPC for simulation.",
      warnings: [],
    };
  }
}
