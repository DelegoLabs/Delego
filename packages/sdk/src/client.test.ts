import { describe, it, expect, vi, beforeEach } from "vitest";
import { DelegoClient } from "./client.js";

describe("DelegoClient", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("constructs with baseUrl", () => {
    const client = new DelegoClient({ baseUrl: "http://localhost:3000" });
    expect(client).toBeInstanceOf(DelegoClient);
  });

  it("strips trailing slash from baseUrl", () => {
    const client = new DelegoClient({ baseUrl: "http://localhost:3000/" });
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ data: null })));

    client.health();

    expect(spy).toHaveBeenCalledWith("http://localhost:3000/health", expect.anything());
  });

  it("sends Authorization header when token is set", async () => {
    const client = new DelegoClient({ baseUrl: "http://localhost", token: "secret-token" });
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ data: null })));

    await client.health();

    const init = spy.mock.calls[0][1] as RequestInit;
    const headers = init!.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer secret-token");
  });

  it("health() calls GET /health", async () => {
    const client = new DelegoClient({ baseUrl: "http://localhost" });
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: { status: "ok" } }))
    );

    const res = await client.health();

    expect(spy).toHaveBeenCalledWith("http://localhost/health", expect.anything());
    expect(res.data).toEqual({ status: "ok" });
  });

  it("returns the ApiResponse shape from the API", async () => {
    const client = new DelegoClient({ baseUrl: "http://localhost" });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: [{ id: "1" }], error: null }))
    );

    const res = await client.getDelegations();

    expect(res.data).toHaveLength(1);
    expect(res.error).toBeNull();
  });
});