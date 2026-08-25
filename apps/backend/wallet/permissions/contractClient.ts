import { Address, Horizon, Networks, Operation, rpc, TransactionBuilder, nativeToScVal, scValToNative } from "@stellar/stellar-sdk";
import { createLogger } from "@delego/utils";

const log = createLogger("wallet:permissions:contract", process.env.LOG_LEVEL ?? "info");

const STELLAR_STRKEY_RE = /^[GC][A-Z2-7]{55}$/;

function argToScVal(arg: unknown) {
  if (typeof arg === "string" && STELLAR_STRKEY_RE.test(arg)) {
    try {
      return Address.fromString(arg).toScVal();
    } catch {
      // Fall back to default encoding when strkey checksum is invalid.
    }
  }
  return nativeToScVal(arg);
}

function getStellarConfig(): { horizonUrl: string; rpcUrl: string; networkPassphrase: string } {
  const network = (process.env.STELLAR_NETWORK ?? "testnet").toLowerCase();
  if (network === "mainnet") {
    return {
      horizonUrl: process.env.STELLAR_HORIZON_URL ?? "https://horizon.stellar.org",
      rpcUrl: process.env.STELLAR_RPC_URL ?? "https://rpc.stellar.org",
      networkPassphrase: Networks.PUBLIC,
    };
  }
  if (network === "futurenet") {
    return {
      horizonUrl: process.env.STELLAR_HORIZON_URL ?? "https://horizon-futurenet.stellar.org",
      rpcUrl: process.env.STELLAR_RPC_URL ?? "https://rpc-futurenet.stellar.org",
      networkPassphrase: Networks.FUTURENET,
    };
  }
  return {
    horizonUrl: process.env.STELLAR_HORIZON_URL ?? "https://horizon-testnet.stellar.org",
    rpcUrl: process.env.STELLAR_RPC_URL ?? "https://soroban-testnet.stellar.org",
    networkPassphrase: Networks.TESTNET,
  };
}

export function getPermissionsContractId(): string {
  const contractId = process.env.PERMISSIONS_CONTRACT_ID;
  if (!contractId) {
    throw new Error("PERMISSIONS_CONTRACT_ID environment variable is not configured");
  }
  return contractId;
}

export interface OnChainSpendPreview {
  allowed: boolean;
  reason: string;
  remaining_after: string | number | bigint;
}

/**
 * Read-only call to `preview_spend(owner, delegate, amount, merchant)` on the
 * permissions contract (contracts/permissions/src/lib.rs). Simulation only —
 * never signs or submits a transaction, so it can never touch any
 * spend-mutating call site. `sourceAddress` only pays the simulated
 * transaction's source-account fee; it does not have to be `owner`.
 */
export async function previewSpendFromChain(
  owner: string,
  delegate: string,
  amountStroops: bigint,
  merchant: string,
  sourceAddress: string
): Promise<OnChainSpendPreview> {
  const { horizonUrl, rpcUrl, networkPassphrase } = getStellarConfig();
  const horizon = new Horizon.Server(horizonUrl);
  const rpcServer = new rpc.Server(rpcUrl);
  const account = await horizon.loadAccount(sourceAddress);
  const contractId = getPermissionsContractId();

  const tx = new TransactionBuilder(account, {
    fee: "100",
    networkPassphrase,
  })
    .addOperation(
      Operation.invokeContractFunction({
        contract: contractId,
        function: "preview_spend",
        args: [
          argToScVal(owner),
          argToScVal(delegate),
          argToScVal(amountStroops),
          argToScVal(merchant),
        ],
      })
    )
    .setTimeout(30)
    .build();

  log.info("Simulating preview_spend", { contractId, owner, delegate, merchant });
  const sim = await rpcServer.simulateTransaction(tx);
  if (!rpc.Api.isSimulationSuccess(sim)) {
    throw new Error(`preview_spend simulation failed: ${JSON.stringify(sim)}`);
  }

  return scValToNative(sim.result!.retval) as OnChainSpendPreview;
}
