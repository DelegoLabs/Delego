"use client";

import { useCallback, useEffect, useRef } from "react";

export interface TabSyncMessage {
  type: "CART_UPDATED" | "ORDER_STATUS_CHANGED" | "WALLET_DISCONNECTED";
  payload: Record<string, unknown>;
  senderTabId: string;
}

const CHANNEL_NAME = "delego_tab_sync";
const subscribers = new Set<(message: TabSyncMessage) => void>();
const senderTabId =
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `tab-${Date.now()}-${Math.random().toString(36).slice(2)}`;

let channel: BroadcastChannel | null = null;

function isTabSyncMessage(value: unknown): value is TabSyncMessage {
  if (!value || typeof value !== "object") return false;
  const message = value as Partial<TabSyncMessage>;
  return (
    (message.type === "CART_UPDATED" ||
      message.type === "ORDER_STATUS_CHANGED" ||
      message.type === "WALLET_DISCONNECTED") &&
    !!message.payload &&
    typeof message.payload === "object" &&
    typeof message.senderTabId === "string"
  );
}

function ensureChannel(): BroadcastChannel | null {
  if (typeof window === "undefined") return null;
  if (channel) return channel;

  const BrowserBroadcastChannel = (
    window as Window & { BroadcastChannel?: typeof BroadcastChannel }
  ).BroadcastChannel;
  if (typeof BrowserBroadcastChannel !== "function") return null;

  channel = new BrowserBroadcastChannel(CHANNEL_NAME);
  channel.addEventListener("message", (event: MessageEvent<unknown>) => {
    if (
      !isTabSyncMessage(event.data) ||
      event.data.senderTabId === senderTabId
    ) {
      return;
    }
    for (const subscriber of subscribers) subscriber(event.data);
  });
  return channel;
}

export function broadcastTabSync(
  type: TabSyncMessage["type"],
  payload: Record<string, unknown>
): void {
  ensureChannel()?.postMessage({ type, payload, senderTabId });
}

/** Shares typed tab-sync messages over the app-wide `delego_tab_sync` channel. */
export function useBroadcastChannel(
  onMessage?: (message: TabSyncMessage) => void
) {
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  useEffect(() => {
    const subscriber = (message: TabSyncMessage) => {
      onMessageRef.current?.(message);
    };
    subscribers.add(subscriber);
    ensureChannel();
    return () => {
      subscribers.delete(subscriber);
    };
  }, []);

  const broadcast = useCallback(broadcastTabSync, []);
  return { broadcast, senderTabId };
}
