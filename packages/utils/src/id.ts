import { randomUUID } from "node:crypto";
import { type IncomingMessage, type ServerResponse } from "node:http";
import { json } from "./http.js";
import { StrKey } from "@stellar/stellar-sdk";

export interface PublicKeyValidationResult {
  valid: boolean;
  normalized?: string;
  error?: "missing" | "invalid_strkey" | "secret_key_not_allowed";
}

export type RequestHandler = (
  req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>
) => void | Promise<void>;

/** Generate a UUID v4 identifier */
export function generateId(): string {
  return randomUUID();
}

// Fix: trim the key before validation so that surrounding whitespace (common during copy-paste) does not cause a valid key to be rejected as invalid_strkey, and return the normalized (trimmed) key
export function validatePublicKey(key: string): PublicKeyValidationResult {
  if (!key || typeof key !== "string" || key.trim() === "") {
    return { valid: false, error: "missing" };
  }

  const trimmed = key.trim();

  if (StrKey.isValidEd25519SecretSeed(trimmed)) {
    return { valid: false, error: "secret_key_not_allowed" };
  }

  if (!StrKey.isValidEd25519PublicKey(trimmed)) {
    return { valid: false, error: "invalid_strkey" };
  }

  return { valid: true, normalized: trimmed };
}

export function isValidStellarPublicKey(key: string): boolean {
  return validatePublicKey(key).valid;
}

export function validatePublicKeyMiddleware(paramName: string): RequestHandler {
  return async (_req, res, params) => {
    const publicKey = params[paramName];
    const result = validatePublicKey(publicKey ?? "");

    if (!result.valid) {
      const message = result.error === "secret_key_not_allowed"
        ? "Secret key values are not allowed"
        : "Malformed Stellar public key address";

      json(res, 400, {
        data: null,
        error: { code: "BAD_REQUEST", message },
      });
      return;
    }
  };
}
