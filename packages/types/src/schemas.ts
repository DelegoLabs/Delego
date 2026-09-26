import { z } from "zod";

export const ColorTagSchema = z.enum([
  "slate",
  "indigo",
  "emerald",
  "amber",
  "rose",
  "cyan",
  "violet",
  "teal",
]);

export const DelegationPermissionLevelSchema = z.enum([
  "VIEW_ONLY",
  "AUTO_APPROVE",
  "SIGNER",
  "ADMIN",
]);

export const DelegationStatusSchema = z.enum([
  "active",
  "paused",
  "revoked",
  "expired",
  "pending",
]);

export const DelegationPolicySchema = z.object({
  maxPerTransaction: z.union([z.string(), z.number(), z.bigint()]),
  maxTotal: z.union([z.string(), z.number(), z.bigint()]),
  allowedMerchants: z.array(z.string()),
  allowedCategories: z.array(z.string()).optional(),
  expiresAt: z.union([z.string(), z.number(), z.date(), z.null()]).optional(),
});

export const DelegationSchema = z.object({
  id: z.string(),
  userId: z.string(),
  agentId: z.string(),
  walletId: z.string().optional(),
  label: z.string().optional(),
  colorTag: ColorTagSchema.optional(),
  status: DelegationStatusSchema,
  permissionLevel: DelegationPermissionLevelSchema.optional(),
  policy: DelegationPolicySchema,
  createdAt: z.union([z.string(), z.number(), z.date()]),
  updatedAt: z.union([z.string(), z.number(), z.date()]),
});

export const OrderStatusSchema = z.enum([
  "pending",
  "pending_approval",
  "approved",
  "rejected",
  "completed",
  "failed",
  "canceled",
  "draft",
  "escrowed",
  "fulfilled",
  "settled",
]);

export const OrderItemSchema = z.object({
  name: z.string().optional(),
  productId: z.string().optional(),
  price: z.number().optional(),
  unitPriceStroops: z.union([z.number(), z.bigint()]).optional(),
  quantity: z.number(),
});

export const OrderSchema = z.object({
  id: z.string(),
  delegationId: z.string(),
  merchantName: z.string().optional(),
  merchantId: z.string().optional(),
  amount: z.union([z.string(), z.number(), z.bigint()]).optional(),
  totalStroops: z.union([z.string(), z.number(), z.bigint()]).optional(),
  currency: z.string().optional(),
  status: OrderStatusSchema,
  createdAt: z.union([z.string(), z.number(), z.date()]),
  updatedAt: z.union([z.string(), z.number(), z.date()]).optional(),
  items: z.array(OrderItemSchema).optional(),
  lineItems: z.array(OrderItemSchema).optional(),
  escrowContractId: z.string().nullable().optional(),
});

export const EscrowStatusSchema = z.enum([
  "funded",
  "released",
  "disputed",
  "refunded",
  "Funded",
  "Released",
  "Disputed",
  "Refunded",
]);

export const EscrowSchema = z.object({
  id: z.string().optional(),
  escrowId: z.string().optional(),
  orderId: z.string(),
  buyerId: z.string().optional(),
  buyer: z.string().optional(),
  sellerId: z.string().optional(),
  seller: z.string().optional(),
  amount: z.union([z.string(), z.number(), z.bigint()]),
  status: EscrowStatusSchema,
  token: z.string().optional(),
  timeoutLedger: z.number().optional(),
  currentLedger: z.number().optional(),
  createdAt: z.union([z.string(), z.number(), z.date()]),
});

export const UserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string().optional(),
  walletAddress: z.string().optional(),
});

export const UserPreferencesSchema = z.object({
  currency: z.string(),
  theme: z.enum(["light", "dark", "system"]),
  notificationsEnabled: z.boolean(),
});

export const ApiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
});

export const ApiResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    data: dataSchema.nullable(),
    error: ApiErrorSchema.nullable(),
  });
