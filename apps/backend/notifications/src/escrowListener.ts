import { rpc as SorobanRpc, scValToNative } from "@stellar/stellar-sdk";
import { createLogger } from "@delego/utils";
import { Redis } from "ioredis";
import { getWalletLookupAdapter } from "./walletLookup.js";
import { checkAndMarkDispatched } from "./idempotency.js";
import { sendEmail } from "../email/index.js";
import { sendPushNotification, type PushPayload, type PushSubscription } from "../push/index.js";

const log = createLogger(
  "notifications:escrow-listener",
  process.env.LOG_LEVEL ?? "info"
);

const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");

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

let isRunning = false;
let timeoutId: NodeJS.Timeout | null = null;

export function startEscrowEventListener(rpcUrl: string, contractId: string): void {
  if (isRunning) {
    log.warn("Escrow event listener is already running");
    return;
  }
  isRunning = true;
  
  const server = new SorobanRpc.Server(rpcUrl);
  log.info("Starting escrow event listener", { rpcUrl, contractId });
  
  const poll = async () => {
    if (!isRunning) return;

    try {
      const latestLedgerResponse = await server.getLatestLedger();
      const latestLedger = latestLedgerResponse.sequence;

      const lastProcessedKey = `escrow_listener:last_ledger:${contractId}`;
      const lastProcessedStr = await redis.get(lastProcessedKey);
      
      let startLedger = lastProcessedStr ? parseInt(lastProcessedStr, 10) + 1 : latestLedger - 100;
      
      if (startLedger > latestLedger) {
        startLedger = latestLedger;
      }
      
      if (startLedger <= latestLedger) {
        const eventsResponse = await server.getEvents({
          startLedger,
          filters: [
            {
              type: "contract",
              contractIds: [contractId],
              topics: [["*"]], // Match any topics for this contract
            },
          ],
          limit: 1000,
        });

        for (const event of eventsResponse.events) {
          if (event.type !== "contract" || !event.inSuccessfulContractCall) {
            continue;
          }

          try {
            const topics = event.topic.map(t => scValToNative(t));
            if (topics[0] !== "escrow" || !topics[1]) continue;

            const eventTypeRaw = topics[1];
            let eventType: EscrowContractEvent["eventType"];
            
            switch (eventTypeRaw) {
              case "created":
                eventType = "escrow_created";
                break;
              case "resolved":
                eventType = "escrow_released"; 
                break;
              case "refunded":
                eventType = "escrow_refunded";
                break;
              case "disputed":
                eventType = "escrow_disputed";
                break;
              default:
                continue;
            }

            const value = scValToNative(event.value);

            if (eventTypeRaw === "resolved" && value && value.release_to_seller === false) {
              eventType = "escrow_refunded";
            }
            if (eventTypeRaw === "resolved" && value && value.release_to_seller === true) {
              eventType = "escrow_released";
            }

            const escrowEvent: EscrowContractEvent = {
              contractId: event.contractId,
              eventType,
              orderId: value.order_id || value.orderId || "", 
              buyer: value.buyer || "",
              merchant: value.seller || value.merchant || "", 
              amountStroops: value.amount ? value.amount.toString() : "0",
              ledger: event.ledger,
              txHash: event.txHash,
            };

            await dispatchEscrowNotification(escrowEvent, `${event.txHash}-${event.id}`);
          } catch (e) {
            log.warn("Failed to parse or process event", { error: e, event });
          }
        }

        await redis.set(lastProcessedKey, latestLedger.toString());
      }
    } catch (error) {
      log.error("Error polling escrow events", { error });
    }

    if (isRunning) {
      timeoutId = setTimeout(poll, 5000);
    }
  };

  poll();
}

export function stopEscrowEventListener(): void {
  isRunning = false;
  if (timeoutId) {
    clearTimeout(timeoutId);
    timeoutId = null;
  }
}

async function dispatchEscrowNotification(event: EscrowContractEvent, eventId: string) {
  const adapter = getWalletLookupAdapter();
  
  // Decide who needs the notification
  let targetAddress: string | null = null;
  let subject = "";
  let templateName = "";
  let body = "";

  if (event.eventType === "escrow_created") {
    // Escrow created by buyer, notify merchant
    targetAddress = event.merchant;
    subject = "New Escrow Funded";
    templateName = "escrow-funded";
    body = `A new escrow for order ${event.orderId} has been funded.`;
  } else if (event.eventType === "escrow_released") {
    // Funds released to merchant, notify merchant
    targetAddress = event.merchant;
    subject = "Escrow Released";
    templateName = "escrow-released";
    body = `Funds for order ${event.orderId} have been released to you.`;
  } else if (event.eventType === "escrow_refunded") {
    // Funds refunded to buyer, notify buyer
    targetAddress = event.buyer;
    subject = "Escrow Refunded";
    templateName = "escrow-refunded";
    body = `Funds for order ${event.orderId} have been refunded to you.`;
  } else if (event.eventType === "escrow_disputed") {
    // Disputed, notify both? For simplicity, notify merchant
    targetAddress = event.merchant;
    subject = "Escrow Disputed";
    templateName = "escrow-disputed";
    body = `A dispute has been opened for order ${event.orderId}.`;
  }

  if (!targetAddress) return;

  const target = await adapter.lookupByWalletAddress(targetAddress);
  if (!target) {
    log.info("No notification target found for wallet", { targetAddress, eventId });
    return;
  }

  const tasks: Promise<void>[] = [];

  // Email
  if (target.email) {
    const shouldSend = await checkAndMarkDispatched(redis, {
      userId: target.userId,
      channel: "email",
      eventType: event.eventType,
      eventId,
    });

    if (shouldSend) {
      tasks.push(
        sendEmail({
          to: target.email,
          subject,
          templateName,
          templateData: {
            orderId: event.orderId,
            amount: event.amountStroops,
          },
        }).catch((err) =>
          log.error("Failed to send escrow email", { error: err, userId: target.userId })
        )
      );
    }
  }

  // Push
  if (target.pushEnabled) {
    const shouldSend = await checkAndMarkDispatched(redis, {
      userId: target.userId,
      channel: "push",
      eventType: event.eventType,
      eventId,
    });

    if (shouldSend) {
      const payload: PushPayload = {
        title: subject,
        body,
        data: {
          type: event.eventType,
          orderId: event.orderId,
          amount: event.amountStroops,
        },
      };

      tasks.push(
        (async () => {
          const subscriptions = await redis.smembers(`push:subscriptions:${target.userId}`);
          for (const subStr of subscriptions) {
            const sub = JSON.parse(subStr) as PushSubscription;
            await sendPushNotification(sub, payload).catch((err) =>
              log.error("Failed to send escrow push", { error: err, userId: target.userId })
            );
          }
        })()
      );
    }
  }

  await Promise.all(tasks);
}
