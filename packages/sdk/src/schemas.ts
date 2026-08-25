import { z } from "zod";

export class ValidationError extends Error {
  public readonly fieldPath: string;
  public readonly expectedType: string;

  constructor(fieldPath: string, expectedType: string) {
    super(`Validation failed at "${fieldPath}": expected ${expectedType}`);
    this.name = "ValidationError";
    this.fieldPath = fieldPath;
    this.expectedType = expectedType;
  }
}

export const HealthCheckResponseSchema = z.object({
  status: z.enum(["ok", "degraded", "down"]),
  service: z.string(),
  version: z.string(),
  timestamp: z.string(),
});

export const DelegationStatusSchema = z.enum([
  "pending",
  "active",
  "paused",
  "revoked",
  "expired",
]);

export const SpendingPolicySchema = z.object({
  maxPerTransaction: z.union([z.bigint(), z.number()]).transform((v) => BigInt(v)),
  maxTotal: z.union([z.bigint(), z.number()]).transform((v) => BigInt(v)),
  allowedMerchants: z.array(z.string()),
  expiresAt: z.string().nullable(),
});

export const DelegationSchema = z.object({
  id: z.string(),
  userId: z.string(),
  agentId: z.string(),
  status: DelegationStatusSchema,
  policy: SpendingPolicySchema,
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export type ValidatedDelegation = z.infer<typeof DelegationSchema>;

export const OrderStatusSchema = z.enum([
  "draft",
  "pending_approval",
  "approved",
  "escrowed",
  "fulfilled",
  "settled",
  "cancelled",
  "disputed",
]);

export const OrderLineItemSchema = z.object({
  productId: z.string(),
  quantity: z.number(),
  unitPriceStroops: z.union([z.bigint(), z.number()]).transform((v) => BigInt(v)),
});

export const OrderSchema = z.object({
  id: z.string(),
  userId: z.string(),
  delegationId: z.string(),
  merchantId: z.string(),
  status: OrderStatusSchema,
  lineItems: z.array(OrderLineItemSchema),
  totalStroops: z.union([z.bigint(), z.number()]).transform((v) => BigInt(v)),
  escrowContractId: z.string().nullable(),
  escrowId: z.string().nullable().optional(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export type ValidatedOrder = z.infer<typeof OrderSchema>;

export const RefundEligibilityReasonSchema = z.enum([
  "ok",
  "notfund",
  "released",
  "refunded",
  "cancelled",
  "unfunded",
  "disputed",
  "timeout",
  "noauth",
]);

export const RefundEligibilitySchema = z.object({
  escrowId: z.string(),
  eligible: z.boolean(),
  reason: RefundEligibilityReasonSchema,
});

export const RefundRequestReasonCodeSchema = z.enum([
  "timeout",
  "buyer_cancelled",
  "merchant_cancelled",
  "dispute_buyer",
  "system_error",
]);

export const RefundRequestResultSchema = z.object({
  txHash: z.string(),
  ledger: z.number(),
  success: z.boolean(),
  escrowId: z.string().optional(),
  refundReasonCode: RefundRequestReasonCodeSchema,
});

export const SpendPreviewReasonSchema = z.enum([
  "ok",
  "not_found",
  "expired",
  "paused",
  "unauthorized",
  "per_tx_limit",
  "total_limit",
  "bad_merchant",
]);

export const SpendPreviewSchema = z.object({
  allowed: z.boolean(),
  reason: SpendPreviewReasonSchema,
  remainingAfterStroops: z.string(),
});

export const ApiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.record(z.unknown()).optional(),
});

export const ApiResponseSchema = <T extends z.ZodType>(dataSchema: T) =>
  z.object({
    data: dataSchema.nullable(),
    error: ApiErrorSchema.nullable(),
  });

export function validateResponse<T>(
  data: unknown,
  schema: z.ZodType<T>
): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const firstIssue = result.error.issues[0];
    const fieldPath = firstIssue.path.join(".") || "root";
    const expectedType = firstIssue.message;
    throw new ValidationError(fieldPath, expectedType);
  }
  return result.data;
}
