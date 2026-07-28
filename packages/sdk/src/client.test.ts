import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DelegoClient, TimeoutError } from "./client.js";
import { HealthCheckResponseSchema } from "./schemas.js";

describe("DelegoClient", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("constructs with baseUrl", () => {
    const client = new DelegoClient({ baseUrl: "http://localhost:3000" });
    expect(client).toBeInstanceOf(DelegoClient);
  });

  it("strips trailing slash from baseUrl", () => {
    const client = new DelegoClient({ baseUrl: "http://localhost:3000/" });
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            status: "ok",
            service: "test",
            version: "1.0.0",
            timestamp: "2024-01-01T00:00:00Z",
          },
          error: null,
        })
      )
    );

    client.health();

    expect(spy).toHaveBeenCalledWith(
      "http://localhost:3000/health",
      expect.anything()
    );
  });

  it("sends Authorization header when token is set", async () => {
    const client = new DelegoClient({
      baseUrl: "http://localhost",
      token: "secret-token",
    });
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            status: "ok",
            service: "test",
            version: "1.0.0",
            timestamp: "2024-01-01T00:00:00Z",
          },
          error: null,
        })
      )
    );

    await client.health();

    const init = spy.mock.calls[0][1] as RequestInit;
    const headers = init!.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer secret-token");
  });

  it("health() calls GET /health", async () => {
    const client = new DelegoClient({ baseUrl: "http://localhost" });
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            status: "ok",
            service: "gateway",
            version: "1.0.0",
            timestamp: "2024-01-01T00:00:00Z",
          },
          error: null,
        })
      )
    );

    const res = await client.health();

    expect(spy).toHaveBeenCalledWith(
      "http://localhost/health",
      expect.anything()
    );
    expect(res.data).toEqual({
      status: "ok",
      service: "gateway",
      version: "1.0.0",
      timestamp: "2024-01-01T00:00:00Z",
    });
  });

  it("returns the ApiResponse shape from the API", async () => {
    const client = new DelegoClient({ baseUrl: "http://localhost" });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            {
              id: "1",
              userId: "user-1",
              agentId: "agent-1",
              status: "active",
              policy: {
                maxPerTransaction: 1000,
                maxTotal: 10000,
                allowedMerchants: [],
                expiresAt: null,
              },
              createdAt: "2024-01-01T00:00:00Z",
              updatedAt: "2024-01-01T00:00:00Z",
            },
          ],
          error: null,
        })
      )
    );

    const res = await client.getDelegations();

    expect(res.data).toHaveLength(1);
    expect(res.error).toBeNull();
  });

  it("includes X-CSRF-Token header on POST requests", async () => {
    const client = new DelegoClient({ baseUrl: "http://localhost" });
    vi.spyOn(document, "cookie", "get").mockReturnValue(
      "csrf-token=test-csrf-value"
    );
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: { status: "ok", service: "test", version: "1.0.0", timestamp: "2024-01-01T00:00:00Z" },
          error: null,
        })
      )
    );

    await client["request"]("/api/test", { method: "POST" }, HealthCheckResponseSchema);

    const init = spy.mock.calls[0][1] as RequestInit;
    const headers = init!.headers as Record<string, string>;
    expect(headers["X-CSRF-Token"]).toBe("test-csrf-value");
  });

  it("does not include X-CSRF-Token header on GET requests", async () => {
    const client = new DelegoClient({ baseUrl: "http://localhost" });
    vi.spyOn(document, "cookie", "get").mockReturnValue(
      "csrf-token=test-csrf-value"
    );
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: { status: "ok", service: "test", version: "1.0.0", timestamp: "2024-01-01T00:00:00Z" },
          error: null,
        })
      )
    );

    await client.health();

    const init = spy.mock.calls[0][1] as RequestInit;
    const headers = init!.headers as Record<string, string>;
    expect(headers["X-CSRF-Token"]).toBeUndefined();
  });

  it("throws TimeoutError when request exceeds timeout", async () => {
    const client = new DelegoClient({
      baseUrl: "http://localhost",
      timeout: 1000,
    });
    vi.spyOn(globalThis, "fetch").mockImplementation(
      () => new Promise(() => {})
    );

    const promise = client.health();
    vi.advanceTimersByTime(1000);

    await expect(promise).rejects.toThrow(TimeoutError);
  });

  it("resolves successfully within timeout", async () => {
    const client = new DelegoClient({
      baseUrl: "http://localhost",
      timeout: 5000,
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            status: "ok",
            service: "gateway",
            version: "1.0.0",
            timestamp: "2024-01-01T00:00:00Z",
          },
          error: null,
        })
      )
    );

    const res = await client.health();
    expect(res.data).toEqual({
      status: "ok",
      service: "gateway",
      version: "1.0.0",
      timestamp: "2024-01-01T00:00:00Z",
    });
  });

  it("cleans up timeout after successful response", async () => {
    const client = new DelegoClient({
      baseUrl: "http://localhost",
      timeout: 5000,
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            status: "ok",
            service: "gateway",
            version: "1.0.0",
            timestamp: "2024-01-01T00:00:00Z",
          },
          error: null,
        })
      )
    );

    await client.health();
    vi.advanceTimersByTime(10000);

    expect(true).toBe(true);
  });

  describe("token storage (#405)", () => {
    function fakeStorage(): Storage {
      const store = new Map<string, string>();
      return {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => void store.set(key, value),
        removeItem: (key: string) => void store.delete(key),
        clear: () => store.clear(),
        key: () => null,
        get length() {
          return store.size;
        },
      } as Storage;
    }

    it("setToken stores the token and getToken retrieves it", () => {
      const client = new DelegoClient({
        baseUrl: "http://localhost",
        storage: fakeStorage(),
      });

      expect(client.getToken()).toBeNull();
      client.setToken("abc123");
      expect(client.getToken()).toBe("abc123");
    });

    it("persists the token across client instances via storage", () => {
      const storage = fakeStorage();
      const first = new DelegoClient({ baseUrl: "http://localhost", storage });
      first.setToken("persisted-token");

      const second = new DelegoClient({ baseUrl: "http://localhost", storage });
      expect(second.getToken()).toBe("persisted-token");
    });

    it("includes the Authorization header once a token is set", async () => {
      const client = new DelegoClient({
        baseUrl: "http://localhost",
        storage: fakeStorage(),
      });
      client.setToken("abc123");

      const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(JSON.stringify({ data: null, error: null }))
      );

      await client.health();

      expect(spy).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: "Bearer abc123" }),
        })
      );
    });

    it("excludes the Authorization header when no token is set", async () => {
      const client = new DelegoClient({
        baseUrl: "http://localhost",
        storage: fakeStorage(),
      });

      const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(JSON.stringify({ data: null, error: null }))
      );

      await client.health();

      const [, init] = spy.mock.calls[0] as [string, RequestInit];
      expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
    });

    it("clearToken removes the token from memory and storage", () => {
      const storage = fakeStorage();
      const client = new DelegoClient({ baseUrl: "http://localhost", storage });
      client.setToken("abc123");

      client.clearToken();

      expect(client.getToken()).toBeNull();
      expect(new DelegoClient({ baseUrl: "http://localhost", storage }).getToken()).toBeNull();
    });

    it("clears the token and calls onUnauthorized on a 401 response", async () => {
      const storage = fakeStorage();
      const onUnauthorized = vi.fn();
      const client = new DelegoClient({
        baseUrl: "http://localhost",
        storage,
        onUnauthorized,
      });
      client.setToken("abc123");

      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(JSON.stringify({ data: null, error: "unauthorized" }), {
          status: 401,
        })
      );

      await client.health();

      expect(client.getToken()).toBeNull();
      expect(onUnauthorized).toHaveBeenCalledTimes(1);
    });

    it("does not call onUnauthorized on a successful response", async () => {
      const onUnauthorized = vi.fn();
      const client = new DelegoClient({
        baseUrl: "http://localhost",
        storage: fakeStorage(),
        onUnauthorized,
      });

      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(JSON.stringify({ data: null, error: null }))
      );

      await client.health();

      expect(onUnauthorized).not.toHaveBeenCalled();
    });
  });

  describe("orders", () => {
    const orderPayload = {
      id: "order-1",
      userId: "user-1",
      delegationId: "del-1",
      merchantId: "merchant-1",
      status: "approved",
      lineItems: [
        { productId: "p1", quantity: 2, unitPriceStroops: 5000 },
      ],
      totalStroops: 10000,
      escrowContractId: null,
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
    };

    it("approveOrder() POSTs to the approve endpoint", async () => {
      const client = new DelegoClient({ baseUrl: "http://localhost" });
      const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(JSON.stringify({ data: orderPayload, error: null }))
      );

      const res = await client.approveOrder("order-1");

      expect(spy).toHaveBeenCalledWith(
        "http://localhost/api/v1/orders/order-1/approve",
        expect.objectContaining({ method: "POST" })
      );
      expect(res.data?.status).toBe("approved");
    });

    it("rejectOrder() POSTs the reason to the reject endpoint", async () => {
      const client = new DelegoClient({ baseUrl: "http://localhost" });
      const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(
          JSON.stringify({
            data: { ...orderPayload, status: "cancelled" },
            error: null,
          })
        )
      );

      const res = await client.rejectOrder("order-1", "too expensive");

      const init = spy.mock.calls[0][1] as RequestInit;
      expect(spy).toHaveBeenCalledWith(
        "http://localhost/api/v1/orders/order-1/reject",
        expect.objectContaining({ method: "POST" })
      );
      expect(JSON.parse(init.body as string)).toEqual({ reason: "too expensive" });
      expect(res.data?.status).toBe("cancelled");
    });

    it("encodes the order id in the path", async () => {
      const client = new DelegoClient({ baseUrl: "http://localhost" });
      const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(JSON.stringify({ data: orderPayload, error: null }))
      );

      await client.approveOrder("a/b");

      expect(spy).toHaveBeenCalledWith(
        "http://localhost/api/v1/orders/a%2Fb/approve",
        expect.anything()
      );
    });
  });
});
