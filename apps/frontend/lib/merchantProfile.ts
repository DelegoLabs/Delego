import { z } from "zod";
import { env } from "./env";
import { createRetryingFetch } from "./api";

/**
 * Strict schema for merchant profile updates (issue #360).
 *
 * Only these public profile fields may be modified by merchants. `.strict()`
 * rejects every other key — including system-managed fields such as
 * `isVerified`, `feeBps`, and `reputationScore` — so a mass-assignment
 * payload can never survive validation.
 */
export const MerchantProfileUpdateSchema = z
  .object({
    displayName: z.string().min(1).max(100).optional(),
    description: z.string().max(1000).optional(),
    supportEmail: z.string().email().optional(),
    webhookUrl: z.string().url().optional(),
  })
  .strict();

export type MerchantProfileUpdate = z.infer<typeof MerchantProfileUpdateSchema>;

/**
 * Fields owned by the backend that must never be settable through the
 * profile update endpoint. Sending any of these is rejected with HTTP 400
 * semantics before a request is ever sent.
 */
export const PROTECTED_MERCHANT_FIELDS: readonly string[] = [
  "id",
  "merchantId",
  "stellarAddress",
  "walletAddress",
  "payoutAddress",
  "isVerified",
  "feeBps",
  "reputationScore",
  "status",
  "role",
  "createdAt",
  "updatedAt",
];

/** Thrown when an update payload attempts to set system-managed fields. */
export class ProtectedFieldError extends Error {
  /** HTTP status the backend would (and the caller should) treat this as. */
  readonly status = 400;
  /** The protected field names that were present in the payload. */
  readonly fields: string[];

  constructor(fields: string[]) {
    super(
      `Cannot update protected field${fields.length > 1 ? "s" : ""}: ${fields.join(", ")}. ` +
        "These are managed by Delego and cannot be changed via the profile endpoint."
    );
    this.name = "ProtectedFieldError";
    this.fields = fields;
  }
}

/**
 * Returns the protected (system-managed) field names present in a payload,
 * in `PROTECTED_MERCHANT_FIELDS` order. Non-object payloads yield an empty
 * list and are left for the Zod schema to reject.
 */
export function detectProtectedFields(payload: unknown): string[] {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return [];
  }
  const keys = new Set(Object.keys(payload as Record<string, unknown>));
  return PROTECTED_MERCHANT_FIELDS.filter((field) => keys.has(field));
}

export type MerchantProfileUpdateResult =
  | { ok: true; data: MerchantProfileUpdate }
  | { ok: false; error: ProtectedFieldError | z.ZodError };

/**
 * Validates an update payload against the strict schema without sending it.
 * Protected fields short-circuit with a {@link ProtectedFieldError}; any
 * other non-whitelisted key is rejected by the schema itself.
 */
export function parseMerchantProfileUpdate(
  payload: unknown
): MerchantProfileUpdateResult {
  const protectedFields = detectProtectedFields(payload);
  if (protectedFields.length > 0) {
    return { ok: false, error: new ProtectedFieldError(protectedFields) };
  }
  const parsed = MerchantProfileUpdateSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, error: parsed.error };
  }
  return { ok: true, data: parsed.data };
}

const retryingFetch = createRetryingFetch();

/**
 * PATCHes the merchant's own profile (`PATCH /merchants/:merchantId`).
 *
 * The payload is validated with {@link MerchantProfileUpdateSchema} first:
 * protected fields throw {@link ProtectedFieldError} (HTTP 400 semantics)
 * and unknown fields fail schema validation, so only approved public
 * profile fields are ever serialized into the request body.
 */
export async function updateMerchantProfile(
  merchantId: string,
  payload: unknown
): Promise<void> {
  const result = parseMerchantProfileUpdate(payload);
  if (!result.ok) {
    throw result.error;
  }

  const res = await retryingFetch(
    `${env.NEXT_PUBLIC_API_URL}/merchants/${encodeURIComponent(merchantId)}`,
    {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(result.data),
    }
  );
  if (!res.ok) {
    throw new Error(`Failed to update merchant profile (${res.status}).`);
  }
}
