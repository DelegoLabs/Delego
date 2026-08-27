import type { ApiResponse, CreateDisputeInput, Dispute } from "@delegolabs/types";
import { createSeededRandom, seededId } from "./faker-lite";

let seedCounter = 1;

export function buildDispute(escrowId: string, orderId: string, input: CreateDisputeInput): Dispute {
  const now = new Date().toISOString();
  seedCounter += 1;
  return {
    id: seededId("dispute", createSeededRandom(seedCounter)),
    escrowId,
    orderId,
    reason: input.reason,
    description: input.description,
    evidenceUrls: input.evidenceUrls,
    status: "open",
    arbiter: null,
    openedBy: "user-demo",
    resolutionNote: null,
    createdAt: now,
    updatedAt: now,
    resolvedAt: null,
  };
}

export function okResponse<T>(data: T): ApiResponse<T> {
  return { data, error: null };
}

export function errorResponse<T>(message: string, code = "internal_error"): ApiResponse<T> {
  return { data: null, error: { code, message } };
}
