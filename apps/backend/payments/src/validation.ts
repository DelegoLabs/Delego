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
