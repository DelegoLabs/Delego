import { describe, it, expect } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../mocks/server";
import { requestDataErasure, cancelDataErasure } from "./erasure";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.example.com";

describe("erasure service (#610)", () => {
  it("requestDataErasure returns the server-issued pending request", async () => {
    server.use(
      http.post(`${BASE_URL}/account/erasure`, () =>
        HttpResponse.json({
          data: {
            requestedAt: "2026-01-01T00:00:00.000Z",
            finalizesAt: "2026-01-31T00:00:00.000Z",
            serverTimestamp: "2026-01-01T00:00:00.000Z",
            status: "pending",
          },
          error: null,
        })
      )
    );

    const res = await requestDataErasure();
    expect(res.error).toBeNull();
    expect(res.data?.status).toBe("pending");
    expect(res.data?.finalizesAt).toBe("2026-01-31T00:00:00.000Z");
  });

  it("cancelDataErasure returns the cancelled request", async () => {
    server.use(
      http.post(`${BASE_URL}/account/erasure/cancel`, () =>
        HttpResponse.json({
          data: {
            requestedAt: "2026-01-01T00:00:00.000Z",
            finalizesAt: "2026-01-31T00:00:00.000Z",
            serverTimestamp: "2026-01-02T00:00:00.000Z",
            status: "cancelled",
          },
          error: null,
        })
      )
    );

    const res = await cancelDataErasure();
    expect(res.data?.status).toBe("cancelled");
  });

  it("surfaces a server error without throwing", async () => {
    server.use(
      http.post(`${BASE_URL}/account/erasure/cancel`, () =>
        HttpResponse.json(
          { data: null, error: { code: "not_found", message: "No pending erasure request to cancel" } },
          { status: 404 }
        )
      )
    );

    const res = await cancelDataErasure();
    expect(res.data).toBeNull();
    expect(res.error?.code).toBe("not_found");
  });

  it("surfaces a network failure as an ApiResponse error instead of throwing", async () => {
    server.use(http.post(`${BASE_URL}/account/erasure`, () => HttpResponse.error()));
    await expect(requestDataErasure()).resolves.toMatchObject({
      data: null,
      error: { code: "network_error" },
    });
  });
});
