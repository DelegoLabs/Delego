import { createLogger } from "@delego/utils";
import Redis from "ioredis";

export interface EscrowContractEvent {
  contractId: string;
  eventType: "escrow_created" | "escrow_released" | "escrow_refunded" | "escrow_disputed";
  orderId: string;
  buyer: string;
  merchant: string;
  amountStroops: string;
  ledger: number;
  txHash: string;
}

const log = createLogger("notifications:escrow", process.env.LOG_LEVEL ?? "info");
const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

function mapTopicToEventType(topic: string): EscrowContractEvent["eventType"] | null {
  switch (topic) {
    case "created":
      return "escrow_created";
    case "released":
      return "escrow_released";
    case "refunded":
      return "escrow_refunded";
    case "disputed":
      return "escrow_disputed";
    default:
      return null;
  }
}

export function startEscrowEventListener(rpcUrl: string, contractId: string) {
  const publisher = new Redis(REDIS_URL);
  const dedupeClient = new Redis(REDIS_URL);

  let cursor: string | null = null;

  async function publishToTopic(topic: string, payload: unknown) {
    const channel = "notifications:*"; // websocket subscribes to this literal channel in current code
    const message = {
      topic,
      type: "escrow_event",
      payload,
      publishedAt: new Date().toISOString(),
    };
    try {
      await publisher.publish(channel, JSON.stringify(message));
    } catch (err) {
      log.error("Failed to publish notification", { error: err });
    }
  }

  async function processEvent(record: any) {
    try {
      const topics: string[] = (record.topics || []).map((t: any) => t.toString());
      const topicName = topics[1] ?? topics[0] ?? null;
      const eventType = topicName ? mapTopicToEventType(topicName) : null;
      if (!eventType) return;

      const txHash = record.tx_hash ?? record.txHash ?? record.transaction_hash ?? "";
      const eventIndex = record.paging_token ?? record.id ?? record.index ?? "0";
      const dedupeKey = `escrow_event:${txHash}:${eventIndex}`;

      const set = await dedupeClient.set(dedupeKey, "1", "EX", 60 * 60 * 24, "NX");
      if (set === null) {
        log.info("Duplicate escrow event skipped", { txHash, eventIndex });
        return;
      }

      // Attempt to normalize payload fields used by notifications
      const data = record.data ?? record.value ?? record.xdr ?? {};
      const escrowId = data.escrow_id ?? data.escrowId ?? data.id ?? data.escrow_id_str ?? data.escrowIdStr ?? null;
      const buyer = data.buyer ?? data.from ?? data.buyer_address ?? null;
      const seller = data.seller ?? data.to ?? data.seller_address ?? null;
      const amount = data.amount ?? data.amount_str ?? data.amountStroops ?? 0;
      const ledger = Number(record.ledger ?? record.ledger_seq ?? record.ledger_seq_num ?? 0);

      const normalized: EscrowContractEvent = {
        contractId,
        eventType,
        orderId: String(escrowId ?? ""),
        buyer: String(buyer ?? ""),
        merchant: String(seller ?? ""),
        amountStroops: String(amount ?? "0"),
        ledger,
        txHash: String(txHash ?? ""),
      };

      // Publish notifications to buyer and merchant user topics
      if (normalized.buyer) {
        await publishToTopic(`user:${normalized.buyer}`, normalized);
      }
      if (normalized.merchant) {
        await publishToTopic(`user:${normalized.merchant}`, normalized);
      }

      log.info("Escrow event dispatched", { txHash, eventType, escrowId });
    } catch (err) {
      log.error("Failed to process escrow event", { error: err, record });
    }
  }

  async function pollLoop() {
    log.info("Starting escrow event poller", { rpcUrl, contractId });
    while (true) {
      try {
        const url = new URL(rpcUrl);
        // Use /events endpoint if available; include contract id and cursor when present
        url.pathname = (url.pathname.replace(/\/$/, "") || "") + "/events";
        if (contractId) url.searchParams.set("contract_id", contractId);
        if (cursor) url.searchParams.set("cursor", cursor as string);
        url.searchParams.set("limit", "100");

        const res = await fetch(url.toString(), { method: "GET" });
        if (!res.ok) {
          log.warn("Soroban RPC returned non-OK status for events", { status: res.status });
          await new Promise((r) => setTimeout(r, 5000));
          continue;
        }

        const json = await res.json();
        const records: any[] = json._embedded?.records ?? json.records ?? json.events ?? [];
        if (records.length === 0) {
          await new Promise((r) => setTimeout(r, 2000));
          continue;
        }

        for (const rec of records) {
          // Only handle records for this contract
          const recContract = rec.contract ?? rec.contract_id ?? rec.contractId ?? rec.address ?? null;
          if (recContract && recContract !== contractId) continue;
          await processEvent(rec);
          // advance cursor/paging token if present
          cursor = rec.paging_token ?? rec.id ?? cursor;
        }
      } catch (err) {
        log.error("Error polling Soroban RPC events", { error: err });
        await new Promise((r) => setTimeout(r, 5000));
      }
    }
  }

  // start poll loop without awaiting (fire-and-forget)
  // eslint-disable-next-line @typescript-eslint/no-floating-promises
  pollLoop();
}

export default startEscrowEventListener;
