import type { ApiResponse } from "@delego/types";
import { createLogger } from "@delego/utils";

const log = createLogger("orchestrator:order-lookup", process.env.LOG_LEVEL ?? "info");

const DEFAULT_PAYMENTS_URL = "http://localhost:3014";

export function getPaymentsUrl(): string {
  return process.env.PAYMENTS_URL ?? DEFAULT_PAYMENTS_URL;
}

export interface OrderPaymentStatus {
  orderId: string;
  paymentId: string;
  status: string;
  txHash?: string;
}

export interface OrderLookupAdapter {
  lookup(orderId: string): Promise<OrderPaymentStatus | null>;
}

export class OrderPaymentNotFoundError extends Error {
  constructor(public readonly orderId: string) {
    super(`Payment record not found for order ${orderId}`);
    this.name = "OrderPaymentNotFoundError";
  }
}

/** Stub adapter — replace with a configured HTTP client in production. */
export const defaultOrderLookupAdapter: OrderLookupAdapter = {
  async lookup(_orderId) {
    return null;
  },
};

export interface PaymentsOrderLookupClient {
  fetchPaymentStatus(orderId: string): Promise<OrderPaymentStatus | null>;
}

/** Default HTTP client for the payments service order lookup endpoint. */
export function createHttpOrderLookupClient(
  baseUrl: string = getPaymentsUrl()
): PaymentsOrderLookupClient {
  return {
    async fetchPaymentStatus(orderId: string): Promise<OrderPaymentStatus | null> {
      const url = `${baseUrl}/api/v1/orders/${encodeURIComponent(orderId)}/payment`;

      let response: Response;
      try {
        response = await fetch(url, {
          method: "GET",
          headers: { Accept: "application/json" },
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to reach payments service";
        log.error("Payments lookup request failed", { orderId, error: message });
        throw new Error(`Payments service unavailable: ${message}`);
      }

      if (response.status === 404) {
        return null;
      }

      const rawBody = await response.text();
      let body: ApiResponse<OrderPaymentStatus>;
      try {
        body = JSON.parse(rawBody) as ApiResponse<OrderPaymentStatus>;
      } catch {
        throw new Error(`Payments service returned invalid response (status ${response.status})`);
      }

      if (!response.ok || body.error) {
        const message = body.error?.message ?? `Payments service returned status ${response.status}`;
        throw new Error(message);
      }

      return body.data ?? null;
    },
  };
}

export function createHttpOrderLookupAdapter(
  client: PaymentsOrderLookupClient = createHttpOrderLookupClient()
): OrderLookupAdapter {
  return {
    lookup: (orderId) => client.fetchPaymentStatus(orderId),
  };
}

/**
 * Fetches payment status for an order without coupling workflow code to payment internals.
 * Returns null when no payment record exists; throws OrderPaymentNotFoundError when required.
 */
export async function lookupOrderPaymentStatus(
  orderId: string,
  adapter: OrderLookupAdapter = defaultOrderLookupAdapter,
  options: { required?: boolean } = {}
): Promise<OrderPaymentStatus | null> {
  const status = await adapter.lookup(orderId);

  if (!status && options.required) {
    throw new OrderPaymentNotFoundError(orderId);
  }

  return status;
}
