/**
 * Soroban simulation dry-run shown before a contract call is confirmed (#703).
 */

import {
  Account,
  Contract,
  TransactionBuilder,
  nativeToScVal,
  rpc,
  scValToNative,
} from "@stellar/stellar-sdk";

export interface SimulationDryRunResult {
  success: boolean;
  cpuInstructions: number;
  memoryBytes: number;
  estimatedFeeStroops: string;
  simulatedReturnValue: string;
  errorReason?: string;
}

const SIMULATION_SOURCE =
  "GCKKRU2H27A4O3MR2IYLXR4RQY5EJFNIWN5VZGZIEG4UIKVE5RN4BPA7";

function toNonNegativeInt(value: unknown): number {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : NaN;
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.min(Math.floor(parsed), Number.MAX_SAFE_INTEGER);
}

function toStroopsString(value: unknown): string {
  if (typeof value === "bigint" && value >= 0n) return value.toString();
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return Math.floor(value).toString();
  }
  if (typeof value === "string" && /^\d+$/.test(value)) return value;
  return "0";
}

function returnValueToString(retval: unknown): string {
  if (retval == null) return "";
  if (typeof retval === "string") return retval;
  try {
    const native = scValToNative(retval as never);
    if (typeof native === "string") return native;
    if (typeof native === "bigint") return native.toString();
    return JSON.stringify(native, (_key, value) =>
      typeof value === "bigint" ? value.toString() : value
    );
  } catch {
    return String(retval);
  }
}

export function mapSimulationResult(simulated: unknown): SimulationDryRunResult {
  const record =
    simulated && typeof simulated === "object"
      ? (simulated as Record<string, unknown>)
      : {};
  const cost =
    record.cost && typeof record.cost === "object"
      ? (record.cost as Record<string, unknown>)
      : {};
  const cpuInstructions = toNonNegativeInt(cost.cpuInsns);
  const memoryBytes = toNonNegativeInt(cost.memBytes);
  const estimatedFeeStroops = toStroopsString(record.minResourceFee);
  const errorText = typeof record.error === "string" ? record.error.trim() : "";
  let simulationError = false;
  try {
    simulationError = rpc.Api.isSimulationError(simulated as never);
  } catch {
    simulationError = Boolean(errorText);
  }

  if (errorText || simulationError) {
    return {
      success: false,
      cpuInstructions,
      memoryBytes,
      estimatedFeeStroops,
      simulatedReturnValue: "",
      errorReason: errorText || "Simulation reverted.",
    };
  }

  const results = Array.isArray(record.results) ? record.results : [];
  const first =
    results[0] && typeof results[0] === "object"
      ? (results[0] as { retval?: unknown; xdr?: unknown })
      : undefined;
  const nested =
    record.result && typeof record.result === "object"
      ? (record.result as { retval?: unknown })
      : undefined;
  const retval = first?.retval ?? nested?.retval ?? first?.xdr;

  return {
    success: true,
    cpuInstructions,
    memoryBytes,
    estimatedFeeStroops,
    simulatedReturnValue: retval == null ? "" : returnValueToString(retval),
  };
}

function failed(message: string): SimulationDryRunResult {
  return {
    success: false,
    cpuInstructions: 0,
    memoryBytes: 0,
    estimatedFeeStroops: "0",
    simulatedReturnValue: "",
    errorReason: message,
  };
}

async function runSimulation(
  tx: unknown,
  rpcUrl: string
): Promise<SimulationDryRunResult> {
  try {
    const server = new rpc.Server(rpcUrl, {
      allowHttp: rpcUrl.startsWith("http://"),
    });
    const simulated = await server.simulateTransaction(
      tx as Parameters<rpc.Server["simulateTransaction"]>[0]
    );
    return mapSimulationResult(simulated);
  } catch (err) {
    return failed(
      err instanceof Error
        ? err.message
        : "Could not reach Soroban RPC to simulate this call."
    );
  }
}

export async function simulateTransactionEnvelope(
  xdr: string,
  rpcUrl: string,
  networkPassphrase: string
): Promise<SimulationDryRunResult> {
  try {
    const tx = TransactionBuilder.fromXDR(xdr, networkPassphrase);
    if (!("operations" in tx)) {
      return failed("Fee-bump envelopes cannot be simulated here.");
    }
    return runSimulation(tx, rpcUrl);
  } catch (err) {
    return failed(
      err instanceof Error ? err.message : "Could not decode this transaction."
    );
  }
}

export async function simulateContractCall(input: {
  rpcUrl: string;
  networkPassphrase: string;
  contractId: string;
  method: string;
  args?: string[];
}): Promise<SimulationDryRunResult> {
  try {
    const account = new Account(SIMULATION_SOURCE, "0");
    const contract = new Contract(input.contractId);
    const scArgs = (input.args ?? []).map((arg) =>
      nativeToScVal(arg, { type: "string" })
    );
    const tx = new TransactionBuilder(account, {
      fee: "100",
      networkPassphrase: input.networkPassphrase,
    })
      .addOperation(contract.call(input.method, ...scArgs))
      .setTimeout(30)
      .build();
    return runSimulation(tx, input.rpcUrl);
  } catch (err) {
    return failed(
      err instanceof Error ? err.message : "Could not build the contract call."
    );
  }
}
