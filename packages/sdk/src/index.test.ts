/**
 * Unit tests for the typed DelegoClient — Issue #1194.
 *
 * Every test uses a fake `fetch` implementation so no network calls are made.
 * Tests verify:
 *  - The correct HTTP method and URL path are used for each endpoint.
 *  - Request bodies are serialized correctly.
 *  - The 401 → onUnauthorized callback fires.
 *  - 204 responses resolve to null.
 *  - AbortSignal is forwarded to fetch.
 *  - The return type is compatible with the declared TypeScript signature
 *    (enforced at compile time — the tests reference typed variables).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  DelegoClient,
  type Delegation,
  type Escrow,
  type Subscription,
  type User,
  type UserPreferences,
  type ApiResponse,
} from "./index.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeResponse(body: unknown, status = 200): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    statusText: status === 204 ? "No Content" : "OK",
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

function makeClient(
  responseBody: unknown,
  status = 200,
  onUnauthorized?: () => void
): { client: DelegoClient; spy: ReturnType<typeof vi.fn> } {
  const spy = vi.fn().mockResolvedValue(makeResponse(responseBody, status));
  const client = new DelegoClient({
    baseUrl: "https://api.delego.test",
    fetch: spy,
    onUnauthorized,
  });
  return { client, spy };
}

/** Extracts the Request URL and init from the first spy call. */
function firstCall(spy: ReturnType<typeof vi.fn>) {
  const [url, init] = spy.mock.calls[0] as [string, RequestInit];
  return { url, init };
}

// ─── DelegoClient constructor ─────────────────────────────────────────────────

describe("DelegoClient constructor", () => {
  it("strips trailing slashes from baseUrl", () => {
    const client = new DelegoClient({ baseUrl: "https://api.delego.test///" });
    expect(client.baseUrl).toBe("https://api.delego.test");
  });

  it("defaults to empty baseUrl when none is provided", () => {
    const client = new DelegoClient();
    expect(client.baseUrl).toBe("");
  });
});

// ─── request helper ───────────────────────────────────────────────────────────

describe("request helper", () => {
  it("adds Authorization header when a token is stored", async () => {
    const { client, spy } = makeClient({ data: null, error: null });
    client.getToken = () => "tok_abc123";
    await client.request("/health");
    const { init } = firstCall(spy);
    const headers = new Headers(init.headers);
    expect(headers.get("Authorization")).toBe("Bearer tok_abc123");
  });

  it("omits Authorization header when no token is present", async () => {
    const { client, spy } = makeClient({ data: null, error: null });
    client.getToken = () => null;
    await client.request("/health");
    const { init } = firstCall(spy);
    const headers = new Headers(init.headers);
    expect(headers.has("Authorization")).toBe(false);
  });

  it("sets Content-Type: application/json when a body is present", async () => {
    const { client, spy } = makeClient({ data: null, error: null });
    await client.request("/test", { method: "POST", body: JSON.stringify({}) });
    const { init } = firstCall(spy);
    const headers = new Headers(init.headers);
    expect(headers.get("Content-Type")).toBe("application/json");
  });

  it("fires onUnauthorized on a 401 response", async () => {
    const onUnauthorized = vi.fn();
    const { client } = makeClient(null, 401, onUnauthorized);
    await client.request("/me");
    expect(onUnauthorized).toHaveBeenCalledOnce();
  });

  it("resolves to null on a 204 response", async () => {
    const spy = vi.fn().mockResolvedValue({ status: 204 } as Response);
    const client = new DelegoClient({
      baseUrl: "https://api.delego.test",
      fetch: spy,
    });
    const result = await client.request("/noop");
    expect(result).toBeNull();
  });

  it("forwards AbortSignal to fetch", async () => {
    const { client, spy } = makeClient({});
    const controller = new AbortController();
    await client.health({ signal: controller.signal });
    const { init } = firstCall(spy);
    expect(init.signal).toBe(controller.signal);
  });
});

// ─── health ───────────────────────────────────────────────────────────────────

describe("health", () => {
  it("calls GET /health", async () => {
    const { client, spy } = makeClient({ status: "ok" });
    await client.health();
    const { url, init } = firstCall(spy);
    expect(url).toBe("https://api.delego.test/health");
    expect(init.method).toBe("GET");
  });
});

// ─── Delegations ──────────────────────────────────────────────────────────────

describe("getDelegations", () => {
  it("calls GET /delegations", async () => {
    const delegations: Delegation[] = [];
    const { client, spy } = makeClient({ data: delegations, error: null });
    const result: ApiResponse<Delegation[]> = await client.getDelegations();
    const { url, init } = firstCall(spy);
    expect(url).toBe("https://api.delego.test/delegations");
    expect(init.method).toBe("GET");
    expect(result.data).toEqual([]);
  });
});

describe("getDelegation", () => {
  it("calls GET /delegations/:id with encoded id", async () => {
    const id = "del/123";
    const { client, spy } = makeClient({ data: null, error: null });
    await client.getDelegation(id);
    const { url } = firstCall(spy);
    expect(url).toBe(
      `https://api.delego.test/delegations/${encodeURIComponent(id)}`
    );
  });
});

describe("createDelegation", () => {
  it("calls POST /delegations with the input body", async () => {
    const input = {
      agentId: "agent-1",
      walletId: "wallet-1",
      label: "Test",
      permissionLevel: "VIEW_ONLY" as const,
      policy: {
        maxPerTransaction: "100",
        maxTotal: "1000",
        allowedMerchants: ["merchant-1"],
      },
    };
    const { client, spy } = makeClient({ data: input, error: null });
    await client.createDelegation(input);
    const { url, init } = firstCall(spy);
    expect(url).toBe("https://api.delego.test/delegations");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toMatchObject({ agentId: "agent-1" });
  });
});

describe("updateDelegation", () => {
  it("calls PATCH /delegations/:id", async () => {
    const id = "del-1";
    const input = { label: "Updated" };
    const { client, spy } = makeClient({ data: null, error: null });
    await client.updateDelegation(id, input);
    const { url, init } = firstCall(spy);
    expect(url).toBe("https://api.delego.test/delegations/del-1");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body as string)).toEqual({ label: "Updated" });
  });
});

describe("revokeDelegation", () => {
  it("calls DELETE /delegations/:id", async () => {
    const { client, spy } = makeClient(null, 204);
    await client.revokeDelegation("del-1");
    const { url, init } = firstCall(spy);
    expect(url).toBe("https://api.delego.test/delegations/del-1");
    expect(init.method).toBe("DELETE");
  });
});

// ─── Escrows ──────────────────────────────────────────────────────────────────

describe("getEscrows", () => {
  it("calls GET /escrows", async () => {
    const escrows: Escrow[] = [];
    const { client, spy } = makeClient({ data: escrows, error: null });
    const result: ApiResponse<Escrow[]> = await client.getEscrows();
    const { url, init } = firstCall(spy);
    expect(url).toBe("https://api.delego.test/escrows");
    expect(init.method).toBe("GET");
    expect(result.data).toEqual([]);
  });
});

describe("getEscrow", () => {
  it("calls GET /escrows/:id", async () => {
    const { client, spy } = makeClient({ data: null, error: null });
    await client.getEscrow("esc-99");
    const { url, init } = firstCall(spy);
    expect(url).toBe("https://api.delego.test/escrows/esc-99");
    expect(init.method).toBe("GET");
  });
});

// ─── Subscriptions ────────────────────────────────────────────────────────────

describe("getSubscriptions", () => {
  it("calls GET /subscriptions", async () => {
    const subs: Subscription[] = [];
    const { client, spy } = makeClient({ data: subs, error: null });
    const result: ApiResponse<Subscription[]> = await client.getSubscriptions();
    const { url, init } = firstCall(spy);
    expect(url).toBe("https://api.delego.test/subscriptions");
    expect(init.method).toBe("GET");
    expect(result.data).toEqual([]);
  });
});

describe("getSubscription", () => {
  it("calls GET /subscriptions/:id with encoded id", async () => {
    const { client, spy } = makeClient({ data: null, error: null });
    await client.getSubscription("sub/1");
    const { url } = firstCall(spy);
    expect(url).toBe(
      `https://api.delego.test/subscriptions/${encodeURIComponent("sub/1")}`
    );
  });
});

describe("createSubscription", () => {
  it("calls POST /subscriptions with the input body", async () => {
    const input = {
      merchantId: "merch-1",
      interval: "monthly" as const,
      amountStroops: "500000000",
      currency: "USDC",
    };
    const { client, spy } = makeClient({ data: input, error: null });
    await client.createSubscription(input);
    const { url, init } = firstCall(spy);
    expect(url).toBe("https://api.delego.test/subscriptions");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toMatchObject({ interval: "monthly" });
  });
});

describe("updateSubscription", () => {
  it("calls PATCH /subscriptions/:id", async () => {
    const { client, spy } = makeClient({ data: null, error: null });
    await client.updateSubscription("sub-1", { status: "paused" });
    const { url, init } = firstCall(spy);
    expect(url).toBe("https://api.delego.test/subscriptions/sub-1");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body as string)).toEqual({ status: "paused" });
  });
});

describe("cancelSubscription", () => {
  it("calls DELETE /subscriptions/:id", async () => {
    const { client, spy } = makeClient(null, 204);
    await client.cancelSubscription("sub-1");
    const { url, init } = firstCall(spy);
    expect(url).toBe("https://api.delego.test/subscriptions/sub-1");
    expect(init.method).toBe("DELETE");
  });
});

// ─── User profile & preferences ───────────────────────────────────────────────

describe("getProfile", () => {
  it("calls GET /me", async () => {
    const user: User = { id: "u1", email: "ada@example.com" };
    const { client, spy } = makeClient({ data: user, error: null });
    const result: ApiResponse<User> = await client.getProfile();
    const { url, init } = firstCall(spy);
    expect(url).toBe("https://api.delego.test/me");
    expect(init.method).toBe("GET");
    expect(result.data?.id).toBe("u1");
  });
});

describe("updateProfile", () => {
  it("calls PATCH /me with the input body", async () => {
    const input = { displayName: "Ada" };
    const { client, spy } = makeClient({ data: null, error: null });
    await client.updateProfile(input);
    const { url, init } = firstCall(spy);
    expect(url).toBe("https://api.delego.test/me");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body as string)).toEqual({ displayName: "Ada" });
  });
});

describe("getPreferences", () => {
  it("calls GET /me/preferences", async () => {
    const prefs: UserPreferences = {
      currency: "USD",
      theme: "dark",
      notificationsEnabled: true,
    };
    const { client, spy } = makeClient({ data: prefs, error: null });
    const result: ApiResponse<UserPreferences> = await client.getPreferences();
    const { url, init } = firstCall(spy);
    expect(url).toBe("https://api.delego.test/me/preferences");
    expect(init.method).toBe("GET");
    expect(result.data?.theme).toBe("dark");
  });
});

describe("updatePreferences", () => {
  it("calls PATCH /me/preferences with the input body", async () => {
    const input = { theme: "light" as const, notificationsEnabled: false };
    const { client, spy } = makeClient({ data: null, error: null });
    await client.updatePreferences(input);
    const { url, init } = firstCall(spy);
    expect(url).toBe("https://api.delego.test/me/preferences");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body as string)).toEqual({
      theme: "light",
      notificationsEnabled: false,
    });
  });
});

// ─── No [key: string]: any escape hatch ──────────────────────────────────────

describe("type safety — no index signature escape hatch", () => {
  it("accessing an unknown property returns undefined at runtime", () => {
    const client = new DelegoClient({ baseUrl: "https://api.delego.test" });
    // With the index signature removed, TypeScript enforces the method
    // vocabulary at compile time.  At runtime we confirm the class does not
    // carry a catch-all property that would mask typos.
    expect((client as unknown as Record<string, unknown>)["nonExistentMethod"]).toBeUndefined();
  });
});
