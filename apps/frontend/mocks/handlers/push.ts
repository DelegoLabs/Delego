import { http, HttpResponse } from "msw";
import type { PushSubscriptionPayload } from "../../lib/webPush";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.example.com";

/** In-memory store of registered push subscriptions (keyed by endpoint). */
const subscriptions = new Map<string, PushSubscriptionPayload>();

/** Reset the in-memory subscription store — call between tests. */
export function resetPushSubscriptions() {
  subscriptions.clear();
}

/** Return a copy of the current in-memory subscriptions for assertions. */
export function getPushSubscriptions(): PushSubscriptionPayload[] {
  return Array.from(subscriptions.values());
}

export const pushHandlers = [
  /**
   * POST /push-subscriptions
   * Register a new push subscription (or update an existing one by endpoint).
   */
  http.post(`${BASE_URL}/push-subscriptions`, async ({ request }) => {
    const body = (await request.json().catch(() => null)) as
      | PushSubscriptionPayload
      | null;

    if (
      !body ||
      !body.endpoint ||
      !body.keys?.p256dh ||
      !body.keys?.auth
    ) {
      return HttpResponse.json(
        { data: null, error: { code: "invalid_body", message: "Missing required fields." } },
        { status: 400 }
      );
    }

    subscriptions.set(body.endpoint, body);

    return HttpResponse.json(
      {
        data: { endpoint: body.endpoint, orderIds: body.orderIds },
        error: null,
      },
      { status: 201 }
    );
  }),

  /**
   * DELETE /push-subscriptions
   * Unregister a push subscription by endpoint.
   */
  http.delete(`${BASE_URL}/push-subscriptions`, async ({ request }) => {
    const body = (await request.json().catch(() => null)) as
      | { endpoint: string }
      | null;

    if (!body?.endpoint) {
      return HttpResponse.json(
        { data: null, error: { code: "invalid_body", message: "Missing endpoint." } },
        { status: 400 }
      );
    }

    const existed = subscriptions.delete(body.endpoint);

    if (!existed) {
      return HttpResponse.json(
        { data: null, error: { code: "not_found", message: "Subscription not found." } },
        { status: 404 }
      );
    }

    return new HttpResponse(null, { status: 204 });
  }),
];

/** Scenario variant: server always rejects subscription registration. */
export const pushHandlersError = [
  http.post(`${BASE_URL}/push-subscriptions`, () =>
    HttpResponse.json(
      {
        data: null,
        error: { code: "internal_error", message: "Failed to register subscription." },
      },
      { status: 500 }
    )
  ),
  http.delete(`${BASE_URL}/push-subscriptions`, () =>
    HttpResponse.json(
      {
        data: null,
        error: { code: "internal_error", message: "Failed to delete subscription." },
      },
      { status: 500 }
    )
  ),
];
