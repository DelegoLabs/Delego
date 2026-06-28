import {
  getEscrowContractId,
  isValidContractId,
  isValidStellarAddress,
} from "../escrow/config.js";
import type {
  DepositEscrowParams,
  InitializeEscrowParams,
  RefundEscrowParams,
  ReleaseEscrowParams,
} from "../escrow/types.js";

// ---------------------------------------------------------------------------
// Issue #202 – Merchant Address Consistency Check
// ---------------------------------------------------------------------------

/**
 * Result of comparing the merchant address in an escrow request against the
 * merchant stored on the order. Both addresses are normalized (trimmed) before
 * comparison; callers should invoke {@link validateMerchantConsistency} to
 * reject mismatches before wallet submission.
 */
export interface MerchantConsistencyCheck {
  orderId: string;
  expectedMerchant: string;
  requestedMerchant: string;
  matches: boolean;
}

/**
 * Normalize a Stellar merchant address for equality comparison.
 * Trims surrounding whitespace; canonical casing is preserved.
 */
function normalizeMerchantAddress(address: string): string {
  return address.trim();
}

/**
 * Compare escrow-request merchant address against the order's stored merchant.
 * Does not reject — use {@link validateMerchantConsistency} as the route guard.
 */
export function checkMerchantConsistency(
  orderId: string,
  expectedMerchant: string,
  requestedMerchant: string
): MerchantConsistencyCheck {
  const normalizedExpected = normalizeMerchantAddress(expectedMerchant);
  const normalizedRequested = normalizeMerchantAddress(requestedMerchant);

  return {
    orderId: orderId.trim(),
    expectedMerchant: normalizedExpected,
    requestedMerchant: normalizedRequested,
    matches: normalizedExpected === normalizedRequested,
  };
}

/**
 * Reject escrow funding when the requested merchant address does not match
 * the merchant stored for the order. Call after request-body validation and
 * before any wallet or contract client is invoked.
 *
 * @example
 * const consistency = validateMerchantConsistency(
 *   fundRequest.orderId,
 *   order.merchantAddress,
 *   fundRequest.merchantAddress
 * );
 * if (!consistency.ok) {
 *   sendValidationError(res, consistency.error);
 *   return;
 * }
 */
export function validateMerchantConsistency(
  orderId: string,
  expectedMerchant: string,
  requestedMerchant: string
): ValidationResult<MerchantConsistencyCheck> {
  const check = checkMerchantConsistency(orderId, expectedMerchant, requestedMerchant);

  if (!check.matches) {
    return {
      ok: false,
      error: {
        code: "MERCHANT_ADDRESS_MISMATCH",
        message:
          "Merchant address in escrow request does not match the merchant stored for the order",
        details: {
          orderId: check.orderId,
          expectedMerchant: check.expectedMerchant,
          requestedMerchant: check.requestedMerchant,
          field: "merchantAddress",
        },
      },
    };
  }

  return { ok: true, value: check };
}

// ---------------------------------------------------------------------------
// Issue #203 – Escrow Release Request Schema
// ---------------------------------------------------------------------------

/**
 * Validated request payload for releasing funds from an escrow contract.
 *
 * All ids are non-empty strings; idempotencyKey ensures exactly-once
 * settlement even if the caller retries on network failure.
 */
export interface ReleaseEscrowRequest {
  orderId: string;
  escrowId: string;
  deliveryProofId: string;
  idempotencyKey: string;
}

// ---------------------------------------------------------------------------
// Issue #204 – Escrow Refund Request Schema
// ---------------------------------------------------------------------------

/**
 * Supported reason codes for escrow refund requests.
 * Keeping a closed enum prevents arbitrary strings reaching the contract.
 */
export const SUPPORTED_REFUND_REASONS = [
  "item_not_received",
  "item_not_as_described",
  "duplicate_charge",
  "fraudulent",
  "order_cancelled",
  "seller_agreement",
] as const;

export type RefundReasonCode = (typeof SUPPORTED_REFUND_REASONS)[number];

/**
 * Validated request payload for refunding an escrow contract back to the buyer.
 */
export interface RefundEscrowRequest {
  orderId: string;
  escrowId: string;
  reasonCode: RefundReasonCode;
  idempotencyKey: string;
}

export interface ValidationError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface IdempotencyContext {
  key: string;
  route: string;
  userId?: string;
}

const IDEMPOTENCY_KEY_MIN = 8;
const IDEMPOTENCY_KEY_MAX = 128;
const IDEMPOTENCY_KEY_RE = /^[\x21-\x7E]+$/;

export function validateIdempotencyKey(
  headers: Record<string, string | string[] | undefined>,
  route: string,
  userId?: string
): ValidationResult<IdempotencyContext> {
  const raw = headers["idempotency-key"] ?? headers["Idempotency-Key"];
  const key = Array.isArray(raw) ? raw[0] : raw;

  if (!key) {
    return {
      ok: false,
      error: {
        code: "MISSING_IDEMPOTENCY_KEY",
        message: "Idempotency-Key header is required for this route",
      },
    };
  }

  if (key.length < IDEMPOTENCY_KEY_MIN) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: `Idempotency-Key must be at least ${IDEMPOTENCY_KEY_MIN} characters`,
        details: { field: "Idempotency-Key" },
      },
    };
  }

  if (key.length > IDEMPOTENCY_KEY_MAX) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: `Idempotency-Key must be at most ${IDEMPOTENCY_KEY_MAX} characters`,
        details: { field: "Idempotency-Key" },
      },
    };
  }

  if (!IDEMPOTENCY_KEY_RE.test(key)) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Idempotency-Key contains invalid characters",
        details: { field: "Idempotency-Key" },
      },
    };
  }

  return { ok: true, value: { key, route, userId } };
}

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: ValidationError };

function missingField(field: string): ValidationError {
  return {
    code: "VALIDATION_ERROR",
    message: `Missing required field: ${field}`,
    details: { field },
  };
}

function invalidField(field: string, message: string): ValidationError {
  return {
    code: "VALIDATION_ERROR",
    message,
    details: { field },
  };
}

function requireString(
  body: Record<string, unknown>,
  field: string
): ValidationResult<string> {
  const value = body[field];
  if (value === undefined || value === null) {
    return { ok: false, error: missingField(field) };
  }
  if (typeof value !== "string" || value.trim() === "") {
    return {
      ok: false,
      error: invalidField(field, `${field} must be a non-empty string`),
    };
  }
  return { ok: true, value: value.trim() };
}

function requireStellarAddress(
  body: Record<string, unknown>,
  field: string
): ValidationResult<string> {
  const result = requireString(body, field);
  if (!result.ok) return result;
  if (!isValidStellarAddress(result.value)) {
    return {
      ok: false,
      error: invalidField(field, `${field} must be a valid Stellar account address`),
    };
  }
  return result;
}

function requireEscrowId(escrowId: string | undefined): ValidationResult<string> {
  if (!escrowId || escrowId.trim() === "") {
    return { ok: false, error: missingField("escrowId") };
  }
  const value = escrowId.trim();
  const id = Number(value);
  if (!Number.isInteger(id) || id < 0) {
    return {
      ok: false,
      error: invalidField("escrowId", "escrowId must be a non-negative integer"),
    };
  }
  return { ok: true, value };
}

export function validateEscrowContractConfig(): ValidationResult<string> {
  try {
    const contractId = getEscrowContractId();
    if (!isValidContractId(contractId)) {
      return {
        ok: false,
        error: {
          code: "CONFIG_ERROR",
          message: "ESCROW_CONTRACT_ID must be a valid Soroban contract address",
        },
      };
    }
    return { ok: true, value: contractId };
  } catch (err) {
    return {
      ok: false,
      error: {
        code: "CONFIG_ERROR",
        message: err instanceof Error ? err.message : "Invalid escrow configuration",
      },
    };
  }
}

export function validateInitializeRequest(
  body: Record<string, unknown>
): ValidationResult<InitializeEscrowParams> {
  const sourceAddress = requireStellarAddress(body, "sourceAddress");
  if (!sourceAddress.ok) return sourceAddress;

  const adminAddress = requireStellarAddress(body, "adminAddress");
  if (!adminAddress.ok) return adminAddress;

  return {
    ok: true,
    value: {
      sourceAddress: sourceAddress.value,
      adminAddress: adminAddress.value,
    },
  };
}

export function validateDepositRequest(
  body: Record<string, unknown>
): ValidationResult<DepositEscrowParams> {
  const sourceAddress = requireStellarAddress(body, "sourceAddress");
  if (!sourceAddress.ok) return sourceAddress;

  const buyerAddress = requireStellarAddress(body, "buyerAddress");
  if (!buyerAddress.ok) return buyerAddress;

  const sellerAddress = requireStellarAddress(body, "sellerAddress");
  if (!sellerAddress.ok) return sellerAddress;

  const params: DepositEscrowParams = {
    sourceAddress: sourceAddress.value,
    buyerAddress: buyerAddress.value,
    sellerAddress: sellerAddress.value,
  };

  if (body.orderId !== undefined && body.orderId !== null) {
    if (typeof body.orderId !== "string" || body.orderId.trim() === "") {
      return {
        ok: false,
        error: invalidField("orderId", "orderId must be a non-empty string when provided"),
      };
    }
    params.orderId = body.orderId.trim();
  }

  return { ok: true, value: params };
}

export function validateReleaseRequest(
  body: Record<string, unknown>,
  escrowIdParam?: string
): ValidationResult<ReleaseEscrowParams> {
  const sourceAddress = requireStellarAddress(body, "sourceAddress");
  if (!sourceAddress.ok) return sourceAddress;

  const escrowId = requireEscrowId(escrowIdParam);
  if (!escrowId.ok) return escrowId;

  return {
    ok: true,
    value: {
      sourceAddress: sourceAddress.value,
      escrowId: escrowId.value,
    },
  };
}

export function validateRefundRequest(
  body: Record<string, unknown>,
  escrowIdParam?: string
): ValidationResult<RefundEscrowParams> {
  const sourceAddress = requireStellarAddress(body, "sourceAddress");
  if (!sourceAddress.ok) return sourceAddress;

  const escrowId = requireEscrowId(escrowIdParam);
  if (!escrowId.ok) return escrowId;

  return {
    ok: true,
    value: {
      sourceAddress: sourceAddress.value,
      escrowId: escrowId.value,
    },
  };
}

// ---------------------------------------------------------------------------
// Issue #203 – validateReleaseEscrowRequest
// ---------------------------------------------------------------------------

/**
 * Validate a release-escrow request body.
 *
 * Checks that orderId, escrowId, deliveryProofId, and idempotencyKey are all
 * present non-empty strings and that the idempotencyKey passes the shared
 * idempotency rules (8–128 printable ASCII chars).
 */
export function validateReleaseEscrowRequest(
  body: Record<string, unknown>
): ValidationResult<ReleaseEscrowRequest> {
  const orderId = requireString(body, "orderId");
  if (!orderId.ok) return orderId;

  const escrowId = requireString(body, "escrowId");
  if (!escrowId.ok) return escrowId;

  const deliveryProofId = requireString(body, "deliveryProofId");
  if (!deliveryProofId.ok) return deliveryProofId;

  const idempotencyKey = requireString(body, "idempotencyKey");
  if (!idempotencyKey.ok) return idempotencyKey;

  // Re-use the shared idempotency-key rules
  const idempotencyResult = validateIdempotencyKey(
    { "idempotency-key": idempotencyKey.value },
    "release-escrow-request"
  );
  if (!idempotencyResult.ok) {
    return {
      ok: false,
      error: {
        code: idempotencyResult.error.code,
        message: idempotencyResult.error.message,
        details: { field: "idempotencyKey" },
      },
    };
  }

  return {
    ok: true,
    value: {
      orderId: orderId.value,
      escrowId: escrowId.value,
      deliveryProofId: deliveryProofId.value,
      idempotencyKey: idempotencyKey.value,
    },
  };
}

// ---------------------------------------------------------------------------
// Issue #204 – validateRefundEscrowRequest
// ---------------------------------------------------------------------------

/**
 * Validate a refund-escrow request body.
 *
 * In addition to the common field checks, `reasonCode` is validated against
 * the closed {@link SUPPORTED_REFUND_REASONS} enum so that only well-known
 * reason codes reach downstream contract calls.
 */
export function validateRefundEscrowRequest(
  body: Record<string, unknown>
): ValidationResult<RefundEscrowRequest> {
  const orderId = requireString(body, "orderId");
  if (!orderId.ok) return orderId;

  const escrowId = requireString(body, "escrowId");
  if (!escrowId.ok) return escrowId;

  const reasonCodeRaw = requireString(body, "reasonCode");
  if (!reasonCodeRaw.ok) return reasonCodeRaw;

  const reasonCodeValue = reasonCodeRaw.value as RefundReasonCode;
  if (!(SUPPORTED_REFUND_REASONS as readonly string[]).includes(reasonCodeValue)) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: `reasonCode must be one of: ${SUPPORTED_REFUND_REASONS.join(", ")}`,
        details: { field: "reasonCode", received: reasonCodeValue },
      },
    };
  }

  const idempotencyKey = requireString(body, "idempotencyKey");
  if (!idempotencyKey.ok) return idempotencyKey;

  const idempotencyResult = validateIdempotencyKey(
    { "idempotency-key": idempotencyKey.value },
    "refund-escrow-request"
  );
  if (!idempotencyResult.ok) {
    return {
      ok: false,
      error: {
        code: idempotencyResult.error.code,
        message: idempotencyResult.error.message,
        details: { field: "idempotencyKey" },
      },
    };
  }

  return {
    ok: true,
    value: {
      orderId: orderId.value,
      escrowId: escrowId.value,
      reasonCode: reasonCodeValue,
      idempotencyKey: idempotencyKey.value,
    },
  };
}
