import { describe, it, expect } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../mocks/server";
import {
  requestCancellation,
  undoCancellation,
  finalizeCancellation,
  requestExtension,
  getEscrowExtensionMeta,
  detectDualControlCapability,
  detectDataErasureCapability,
} from "./payments";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.example.com";

describe("payments service", () => {
  it("requestCancellation returns the server-issued grace window", async () => {
    server.use(
      http.post(`${BASE_URL}/escrows/:id/cancel`, ({ params }) => {
        return HttpResponse.json({
          data: {
            escrow: { id: params.id, orderId: "order-1", amount: 1n, status: "cancelling", createdAt: new Date().toISOString() },
            cancellation: {
              requestedAt: "2026-01-01T00:00:00.000Z",
              gracePeriodSeconds: 30,
              graceExpiresAt: "2026-01-01T00:00:30.000Z",
              serverTimestamp: "2026-01-01T00:00:00.000Z",
            },
          },
          error: null,
        });
      })
    );

    const res = await requestCancellation("escrow-1");
    expect(res.error).toBeNull();
    expect(res.data?.cancellation.gracePeriodSeconds).toBe(30);
  });

  it("undoCancellation surfaces a server error without throwing", async () => {
    server.use(
      http.post(`${BASE_URL}/escrows/:id/cancel/undo`, () =>
        HttpResponse.json({ data: null, error: { code: "already_finalized", message: "Cancellation already finalized" } }, { status: 409 })
      )
    );

    const res = await undoCancellation("escrow-1");
    expect(res.data).toBeNull();
    expect(res.error?.code).toBe("already_finalized");
  });

  it("finalizeCancellation resolves the terminal escrow state", async () => {
    server.use(
      http.post(`${BASE_URL}/escrows/:id/cancel/finalize`, () =>
        HttpResponse.json({
          data: { id: "escrow-1", orderId: "order-1", amount: 1n, status: "cancelled", createdAt: new Date().toISOString() },
          error: null,
        })
      )
    );

    const res = await finalizeCancellation("escrow-1");
    expect(res.data?.status).toBe("cancelled");
  });

  it("requestExtension submits the chosen preset and returns a timeline event", async () => {
    server.use(
      http.post(`${BASE_URL}/escrows/:id/extend`, async ({ request }) => {
        const body = (await request.json()) as { preset: string };
        return HttpResponse.json({
          data: {
            escrow: { id: "escrow-1", orderId: "order-1", amount: 1n, status: "funded", extensionsConsumed: 1, createdAt: new Date().toISOString() },
            timelineEvent: { id: "evt-1", label: `Extension requested (${body.preset})`, timestamp: "2026-01-01T00:00:00.000Z" },
          },
          error: null,
        });
      })
    );

    const res = await requestExtension("escrow-1", "+1w");
    expect(res.data?.timelineEvent.label).toBe("Extension requested (+1w)");
    expect(res.data?.escrow.extensionsConsumed).toBe(1);
  });

  it("getEscrowExtensionMeta fetches the current escrow, deadline metadata included", async () => {
    server.use(
      http.get(`${BASE_URL}/escrows/:id`, () =>
        HttpResponse.json({
          data: {
            id: "escrow-1",
            orderId: "order-1",
            amount: 1n,
            status: "funded",
            originalDeadline: "2026-01-01T00:00:00.000Z",
            extensionsConsumed: 2,
            createdAt: "2026-01-01T00:00:00.000Z",
          },
          error: null,
        })
      )
    );

    const res = await getEscrowExtensionMeta("escrow-1");
    expect(res.data?.originalDeadline).toBe("2026-01-01T00:00:00.000Z");
    expect(res.data?.extensionsConsumed).toBe(2);
  });

  describe("detectDualControlCapability", () => {
    it("returns true when the API advertises the capability", async () => {
      server.use(
        http.get(`${BASE_URL}/capabilities`, () =>
          HttpResponse.json({ data: { dualControlApprovals: true }, error: null })
        )
      );
      expect(await detectDualControlCapability()).toBe(true);
    });

    it("returns false when the API advertises the capability as off", async () => {
      server.use(
        http.get(`${BASE_URL}/capabilities`, () =>
          HttpResponse.json({ data: { dualControlApprovals: false }, error: null })
        )
      );
      expect(await detectDualControlCapability()).toBe(false);
    });

    it("falls back to false when the endpoint 404s", async () => {
      server.use(
        http.get(`${BASE_URL}/capabilities`, () => new HttpResponse(null, { status: 404 }))
      );
      expect(await detectDualControlCapability()).toBe(false);
    });

    it("falls back to false on a network failure rather than throwing", async () => {
      server.use(
        http.get(`${BASE_URL}/capabilities`, () => HttpResponse.error())
      );
      await expect(detectDualControlCapability()).resolves.toBe(false);
    });
  });

  describe("detectDataErasureCapability (#610)", () => {
    it("returns true when the API advertises data-erasure support", async () => {
      server.use(
        http.get(`${BASE_URL}/capabilities`, () =>
          HttpResponse.json({ data: { dataErasureRequestSupported: true }, error: null })
        )
      );
      expect(await detectDataErasureCapability()).toBe(true);
    });

    it("returns false when the API advertises the capability as off", async () => {
      server.use(
        http.get(`${BASE_URL}/capabilities`, () =>
          HttpResponse.json({ data: { dataErasureRequestSupported: false }, error: null })
        )
      );
      expect(await detectDataErasureCapability()).toBe(false);
    });

    it("falls back to false when the endpoint 404s", async () => {
      server.use(
        http.get(`${BASE_URL}/capabilities`, () => new HttpResponse(null, { status: 404 }))
      );
      expect(await detectDataErasureCapability()).toBe(false);
    });

    it("falls back to false on a network failure rather than throwing", async () => {
      server.use(http.get(`${BASE_URL}/capabilities`, () => HttpResponse.error()));
      await expect(detectDataErasureCapability()).resolves.toBe(false);
    });
  });
});
