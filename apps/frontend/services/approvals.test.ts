import { describe, it, expect } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../mocks/server";
import { submitApproval, submitRejection } from "./approvals";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.example.com";

describe("approvals service", () => {
  it("submitRejection posts the approver and reason", async () => {
    server.use(
      http.post(`${BASE_URL}/orders/:id/reject`, async ({ params, request }) => {
        const body = (await request.json()) as { approverAddress: string; reason?: string };
        return HttpResponse.json({
          data: { id: params.id, delegationId: "del-1", status: "rejected", rejectionReason: body.reason, createdAt: new Date().toISOString() },
          error: null,
        });
      })
    );

    const res = await submitRejection("order-1", "wallet-a", "Budget exceeded");
    expect(res.data?.status).toBe("rejected");
    expect(res.data?.rejectionReason).toBe("Budget exceeded");
  });

  it("surfaces a network failure as an ApiResponse error instead of throwing", async () => {
    server.use(http.post(`${BASE_URL}/orders/:id/approve`, () => HttpResponse.error()));
    await expect(submitApproval("order-1", "wallet-a")).resolves.toMatchObject({
      data: null,
      error: { code: "network_error" },
    });
  });
});
