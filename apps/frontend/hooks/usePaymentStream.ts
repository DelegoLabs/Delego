"use client";

import { useEffect, useRef, useState } from "react";

export interface IncomingPaymentStreamEvent {
  id: string;
  assetCode: string;
  amount: string;
  from: string;
  to: string;
  transactionHash: string;
}

export type PaymentStreamStatus =
  "idle" | "connecting" | "connected" | "reconnecting" | "unavailable";

export interface PaymentStreamState {
  status: PaymentStreamStatus;
  latestPayment: IncomingPaymentStreamEvent | null;
  error: string | null;
}

interface HorizonPaymentRecord {
  id?: string;
  asset_type?: string;
  asset_code?: string;
  amount?: string;
  from?: string;
  to?: string;
  transaction_hash?: string;
  _links?: { transaction?: { href?: string } };
}

const INITIAL_STATE: PaymentStreamState = {
  status: "idle",
  latestPayment: null,
  error: null,
};

export function parseIncomingPaymentEvent(
  data: string,
  lastEventId: string,
  recipient: string
): IncomingPaymentStreamEvent | null {
  let record: HorizonPaymentRecord;
  try {
    const parsed: unknown = JSON.parse(data);
    if (!parsed || typeof parsed !== "object") return null;
    record = parsed as HorizonPaymentRecord;
  } catch {
    return null;
  }

  if (
    typeof record.from !== "string" ||
    typeof record.to !== "string" ||
    record.to !== recipient ||
    typeof record.amount !== "string"
  ) {
    return null;
  }

  const transactionHref = record._links?.transaction?.href;
  const linkedHash = transactionHref?.match(/\/transactions\/([^/?#]+)/)?.[1];
  const transactionHash = record.transaction_hash || linkedHash || "";
  const id = record.id || lastEventId || transactionHash;
  const assetCode =
    record.asset_type === "native" ? "XLM" : (record.asset_code ?? "");
  if (!id || !transactionHash || !assetCode) return null;

  return {
    id,
    assetCode,
    amount: record.amount,
    from: record.from,
    to: record.to,
    transactionHash,
  };
}

export function usePaymentStream(
  address: string | null,
  horizonUrl: string,
  enabled: boolean
): PaymentStreamState {
  const [state, setState] = useState<PaymentStreamState>(INITIAL_STATE);
  const seenEventIds = useRef(new Set<string>());

  useEffect(() => {
    if (!enabled || !address) {
      seenEventIds.current.clear();
      setState(INITIAL_STATE);
      return;
    }

    if (typeof EventSource === "undefined") {
      setState({
        status: "unavailable",
        latestPayment: null,
        error: "Live payment updates are not supported by this browser.",
      });
      return;
    }

    let source: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let retryAttempt = 0;
    let active = true;
    seenEventIds.current.clear();
    setState({ status: "connecting", latestPayment: null, error: null });

    const connect = () => {
      if (!active) return;
      const accountUrl = `${horizonUrl.replace(/\/+$/, "")}/accounts/${encodeURIComponent(address)}/payments?cursor=now`;
      const eventSource = new EventSource(accountUrl);
      source = eventSource;
      eventSource.onopen = () => {
        if (active && source === eventSource) {
          retryAttempt = 0;
          setState((prev) => ({ ...prev, status: "connected", error: null }));
        }
      };
      eventSource.onmessage = (event: MessageEvent<string>) => {
        if (!active || source !== eventSource) return;
        const payment = parseIncomingPaymentEvent(
          event.data,
          event.lastEventId,
          address
        );
        if (!payment || seenEventIds.current.has(payment.id)) return;

        if (seenEventIds.current.size >= 500) {
          const oldestEventId = seenEventIds.current.values().next().value;
          if (oldestEventId) seenEventIds.current.delete(oldestEventId);
        }
        seenEventIds.current.add(payment.id);
        retryAttempt = 0;
        setState({ status: "connected", latestPayment: payment, error: null });
      };
      eventSource.onerror = () => {
        if (!active || source !== eventSource) return;
        eventSource.close();
        source = null;
        setState((prev) => ({
          ...prev,
          status: "reconnecting",
          error: "Payment stream disconnected; reconnecting.",
        }));
        const delay = Math.min(1_000 * 2 ** retryAttempt, 30_000);
        retryAttempt += 1;
        retryTimer = setTimeout(connect, delay);
      };
    };

    connect();
    return () => {
      active = false;
      if (retryTimer !== undefined) clearTimeout(retryTimer);
      source?.close();
    };
  }, [address, enabled, horizonUrl]);

  return state;
}
