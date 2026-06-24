import { SorobanRpc } from "@stellar/stellar-sdk";
import { createLogger } from "@delego/utils";
import { sendEmail } from "../email/index.js";

const log = createLogger("notifications:permissionListener", process.env.LOG_LEVEL ?? "info");

export interface PermissionContractEvent {
  contractId: string;
  eventType: "permission_granted" | "permission_updated" | "permission_revoked";
  owner: string;
  delegate: string;
  limitStroops?: string;
  expiresAtLedger?: number;
  txHash: string;
}

const EVENT_TYPE_MAP: Record<string, PermissionContractEvent["eventType"]> = {
  permission_granted: "permission_granted",
  permission_updated: "permission_updated",
  permission_revoked: "permission_revoked",
};

const SUBJECT: Record<PermissionContractEvent["eventType"], string> = {
  permission_granted: "Spending permission granted on your wallet",
  permission_updated: "Spending permission updated on your wallet",
  permission_revoked: "Spending permission revoked on your wallet",
};

/** Resolve a wallet address to a user contact email.
 *  Falls back to the address itself if no lookup is configured. */
async function resolveOwnerEmail(ownerAddress: string): Promise<string> {
  const userServiceUrl = process.env.USER_SERVICE_URL;
  if (!userServiceUrl) {
    log.warn("USER_SERVICE_URL not set — cannot resolve owner email", { ownerAddress });
    return ownerAddress;
  }
  try {
    const res = await fetch(`${userServiceUrl}/users/by-wallet/${encodeURIComponent(ownerAddress)}`);
    if (!res.ok) {
      log.warn("User lookup failed", { ownerAddress, status: res.status });
      return ownerAddress;
    }
    const data = (await res.json()) as { email?: string };
    return data.email ?? ownerAddress;
  } catch (err) {
    log.error("User lookup error", { ownerAddress, error: err });
    return ownerAddress;
  }
}

function buildEmailBody(event: PermissionContractEvent): string {
  const lines = [
    `Event: ${event.eventType}`,
    `Contract: ${event.contractId}`,
    `Owner: ${event.owner}`,
    `Delegate: ${event.delegate}`,
    `Transaction: ${event.txHash}`,
  ];
  if (event.limitStroops !== undefined) lines.push(`Limit (stroops): ${event.limitStroops}`);
  if (event.expiresAtLedger !== undefined) lines.push(`Expires at ledger: ${event.expiresAtLedger}`);
  return lines.join("\n");
}

export async function handlePermissionEvent(event: PermissionContractEvent): Promise<void> {
  log.info("Permission event received", { eventType: event.eventType, txHash: event.txHash });
  const to = await resolveOwnerEmail(event.owner);
  await sendEmail({ to, subject: SUBJECT[event.eventType], body: buildEmailBody(event) });
}

function parseContractEvent(raw: SorobanRpc.Api.EventResponse): PermissionContractEvent | null {
  try {
    // Soroban contract events have a `topic` array and `value`
    // Expected topic[0] = event type symbol, topic[1] = owner, topic[2] = delegate
    const topics = raw.topic as unknown[];
    if (!topics || topics.length < 3) return null;

    const eventTypeRaw = String((topics[0] as { toString(): string }).toString()).replace(/^Symbol\((.+)\)$/, "$1");
    const eventType = EVENT_TYPE_MAP[eventTypeRaw];
    if (!eventType) return null;

    const owner = String((topics[1] as { toString(): string }).toString()).replace(/^Address\((.+)\)$/, "$1");
    const delegate = String((topics[2] as { toString(): string }).toString()).replace(/^Address\((.+)\)$/, "$1");

    const value = raw.value as Record<string, unknown> | null;
    const limitStroops = value?.limit_stroops !== undefined ? String(value.limit_stroops) : undefined;
    const expiresAtLedger = value?.expires_at_ledger !== undefined ? Number(value.expires_at_ledger) : undefined;

    return {
      contractId: raw.contractId ?? "",
      eventType,
      owner,
      delegate,
      limitStroops,
      expiresAtLedger,
      txHash: raw.txHash ?? "",
    };
  } catch (err) {
    log.warn("Failed to parse contract event", { error: err });
    return null;
  }
}

const POLL_INTERVAL_MS = Number(process.env.PERMISSION_LISTENER_POLL_MS ?? 5_000);

/** Poll the Soroban RPC for permission contract events and dispatch email alerts. */
export function startPermissionEventListener(rpcUrl: string, contractId: string): void {
  const server = new SorobanRpc.Server(rpcUrl);
  let lastLedger = 0;

  log.info("Starting permission event listener", { rpcUrl, contractId });

  const poll = async () => {
    try {
      const filters: SorobanRpc.Api.EventFilter[] = [
        { type: "contract", contractIds: [contractId] },
      ];

      const result = await server.getEvents({
        startLedger: lastLedger === 0 ? undefined : lastLedger + 1,
        filters,
        limit: 100,
      } as Parameters<typeof server.getEvents>[0]);

      if (result.events.length > 0) {
        log.info("Fetched events", { count: result.events.length });
        for (const raw of result.events) {
          const event = parseContractEvent(raw);
          if (event) {
            await handlePermissionEvent(event).catch((err) =>
              log.error("Failed to handle permission event", { txHash: event.txHash, error: err })
            );
          }
          // Track ledger for idempotent polling
          const ledger = typeof raw.ledger === "number" ? raw.ledger : Number(raw.ledger ?? 0);
          if (ledger > lastLedger) lastLedger = ledger;
        }
      }
    } catch (err) {
      log.error("Permission event poll error", { error: err });
    } finally {
      setTimeout(poll, POLL_INTERVAL_MS);
    }
  };

  setTimeout(poll, 0);
}
