import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const HEALTH_RESPONSE = {
  data: {
    status: "ok",
    service: "gateway",
    version: "0.0.1",
    timestamp: "2026-01-01T00:00:00.000Z",
  },
  error: null,
};

function mockFetchOnce(body: unknown) {
  const fetchMock = vi.fn().mockResolvedValue({
    status: 200,
    json: async () => body,
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("api client", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.unstubAllGlobals();
  });

  it("instantiates the shared client using NEXT_PUBLIC_API_URL as the base URL", async () => {
    process.env.NEXT_PUBLIC_API_URL = "https://api.example.com";
    const fetchMock = mockFetchOnce(HEALTH_RESPONSE);

    const { api } = await import("./api.js");
    await api.health();

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.com/health",
      expect.anything()
    );
  });

  it("has no auth token by default", async () => {
    process.env.NEXT_PUBLIC_API_URL = "https://api.example.com";
    const { api } = await import("./api.js");

    expect(api.getToken()).toBeNull();
  });

  it("uses a custom base URL when constructed directly, stripping a trailing slash", async () => {
    const { DelegoClient } = await import("@delego/sdk");
    const fetchMock = mockFetchOnce(HEALTH_RESPONSE);

    const client = new DelegoClient({ baseUrl: "https://custom.example.com/" });
    await client.health();

    expect(fetchMock).toHaveBeenCalledWith(
      "https://custom.example.com/health",
      expect.anything()
    );
  });
});
