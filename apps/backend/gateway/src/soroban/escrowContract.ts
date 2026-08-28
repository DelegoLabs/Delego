import {
  Account,
  Address,
  Contract,
  Networks,
  TransactionBuilder,
  nativeToScVal,
  scValToNative,
  rpc as SorobanRpc,
} from "@stellar/stellar-sdk";
import { createLogger } from "@delego/utils";

const log = createLogger("gateway:soroban-escrow", process.env.LOG_LEVEL ?? "info");

export type ContractEscrowStatus = "Active" | "Released" | "Refunded" | "Disputed";

export interface EscrowRecordView {
  buyer: string;
  seller: string;
  token: string;
  amount: bigint;
  status: ContractEscrowStatus;
  unlockTime: bigint;
}

export interface ReleaseEligibilityView {
  eligible: boolean;
  status: ContractEscrowStatus;
  isAuthorizedCaller: boolean;
  alreadyReleased: boolean;
  invalidStatus: boolean;
  unlockTime: bigint;
  currentTime: bigint;
}

function getNetworkPassphrase(): string {
  const network = (process.env.STELLAR_NETWORK ?? "testnet").toLowerCase();
  if (network === "mainnet") return Networks.PUBLIC;
  if (network === "futurenet") return Networks.FUTURENET;
  return Networks.TESTNET;
}

function getRpcUrl(): string {
  return process.env.SOROBAN_RPC_URL ?? process.env.STELLAR_RPC_URL ?? "https://soroban-testnet.stellar.org";
}

function getEscrowContractId(): string {
  const id = process.env.ESCROW_CONTRACT_ID;
  if (!id) {
    throw new Error("ESCROW_CONTRACT_ID is not configured");
  }
  return id;
}

/**
 * Fixed, unfunded account used only to build the transaction envelope for a read-only
 * simulation call. It is never signed or submitted, so it does not need to exist on the
 * ledger or hold a balance.
 */
const VIEW_SOURCE_ACCOUNT = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";

/**
 * soroban_sdk represents a data-less `#[contracttype]` enum variant as a one-element Vec
 * holding the variant name Symbol (kept uniform with data-carrying variants of the same enum),
 * which this SDK's spec-free `scValToNative` then decodes to a one-element JS array, e.g.
 * `["Active"]`. Handle both that shape and a bare string defensively.
 */
function decodeEnumTag(value: unknown): string {
  if (Array.isArray(value) && typeof value[0] === "string") {
    return value[0];
  }
  if (typeof value === "string") {
    return value;
  }
  throw new Error(`Unexpected contract enum encoding: ${JSON.stringify(value)}`);
}

function toEscrowStatus(value: unknown): ContractEscrowStatus {
  const tag = decodeEnumTag(value);
  if (tag === "Active" || tag === "Released" || tag === "Refunded" || tag === "Disputed") {
    return tag;
  }
  throw new Error(`Unknown EscrowStatus tag from contract: ${tag}`);
}

async function simulateReadOnlyCall(
  functionName: string,
  args: ReturnType<typeof nativeToScVal>[]
): Promise<unknown> {
  const rpcServer = new SorobanRpc.Server(getRpcUrl());
  const contract = new Contract(getEscrowContractId());
  const account = new Account(VIEW_SOURCE_ACCOUNT, "0");

  const tx = new TransactionBuilder(account, {
    fee: "100",
    networkPassphrase: getNetworkPassphrase(),
  })
    .addOperation(contract.call(functionName, ...args))
    .setTimeout(30)
    .build();

  const sim = await rpcServer.simulateTransaction(tx);

  if (!SorobanRpc.Api.isSimulationSuccess(sim)) {
    const message = SorobanRpc.Api.isSimulationError(sim) ? sim.error : "Simulation did not succeed";
    log.error("Soroban read-only simulation failed", { functionName, message });
    throw new Error(`Soroban call ${functionName} failed: ${message}`);
  }

  if (!sim.result?.retval) {
    throw new Error(`Soroban call ${functionName} returned no value`);
  }

  return scValToNative(sim.result.retval);
}

export async function getEscrowRecord(escrowId: bigint): Promise<EscrowRecordView> {
  const raw = (await simulateReadOnlyCall("get_escrow", [
    nativeToScVal(escrowId, { type: "u64" }),
  ])) as {
    buyer: string;
    seller: string;
    token: string;
    amount: bigint;
    status: unknown;
    unlock_time: bigint;
  };

  return {
    buyer: raw.buyer,
    seller: raw.seller,
    token: raw.token,
    amount: BigInt(raw.amount),
    status: toEscrowStatus(raw.status),
    unlockTime: BigInt(raw.unlock_time),
  };
}

export async function getReleaseEligibility(
  escrowId: bigint,
  caller: string
): Promise<ReleaseEligibilityView> {
  const raw = (await simulateReadOnlyCall("get_release_eligibility", [
    nativeToScVal(escrowId, { type: "u64" }),
    new Address(caller).toScVal(),
  ])) as {
    eligible: boolean;
    status: unknown;
    is_authorized_caller: boolean;
    already_released: boolean;
    invalid_status: boolean;
    unlock_time: bigint;
    current_time: bigint;
  };

  return {
    eligible: raw.eligible,
    status: toEscrowStatus(raw.status),
    isAuthorizedCaller: raw.is_authorized_caller,
    alreadyReleased: raw.already_released,
    invalidStatus: raw.invalid_status,
    unlockTime: BigInt(raw.unlock_time),
    currentTime: BigInt(raw.current_time),
  };
}
