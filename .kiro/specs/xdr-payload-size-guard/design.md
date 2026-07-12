# Technical Design Document

## Overview

This document describes the technical design for the XDR payload size guard in `apps/backend/wallet/src/queue/txQueue.ts`. The change adds two exports (`XdrValidationResult` interface and `validateXdrSize` function) and inserts a single guard call at the top of `addTransactionToQueue`. The rest of the file is untouched.

---

## Architecture

### Affected Files

| File | Change |
|------|--------|
| `apps/backend/wallet/src/queue/txQueue.ts` | Add `XdrValidationResult` interface, `validateXdrSize` function, and guard call in `addTransactionToQueue` |
| `apps/backend/wallet/src/queue/txQueue.size.test.ts` | New — Vitest unit tests |
| `apps/backend/wallet/package.json` | Add `vitest` as dev dependency; update `test` script |
| `.env.example` | Add `# MAX_XDR_BYTES=65536` comment entry |

No other files change. `executeTxJob`, `runTestJob`, `initQueue`, `closeQueue`, and all imports are read-only from this feature's perspective.

---

## Component Design

### 1. `XdrValidationResult` Interface

Placed immediately after the existing `LedgerSubmissionCheck` interface export, keeping all exported types grouped at the top of the file.

```typescript
export interface XdrValidationResult {
  valid: boolean;
  sizeBytes: number;
  maxBytes: number;
  error?: string;
}
```

The `error` field is optional (absent on success, populated on failure) — matching the discriminated-union style already used by `LedgerSubmissionCheck` and the pattern in `validation.ts` across the codebase.

---

### 2. `validateXdrSize` Function

Placed after `XdrValidationResult` and before `getRedisConnection`, keeping pure utility functions grouped before stateful infrastructure.

```typescript
const DEFAULT_MAX_XDR_BYTES = 65536; // 64 KiB

export function validateXdrSize(request: TransactionRequest): XdrValidationResult {
  const envVal = Number(process.env.MAX_XDR_BYTES);
  const maxBytes =
    Number.isInteger(envVal) && envVal > 0 ? envVal : DEFAULT_MAX_XDR_BYTES;

  const sizeBytes = Buffer.byteLength(JSON.stringify(request), "utf8");

  if (sizeBytes > maxBytes) {
    return {
      valid: false,
      sizeBytes,
      maxBytes,
      error: `Payload too large: ${sizeBytes} bytes exceeds limit of ${maxBytes} bytes`,
    };
  }

  return { valid: true, sizeBytes, maxBytes };
}
```

**Why `Buffer.byteLength(JSON.stringify(request), 'utf8')`?**

`TransactionRequest` is stored in BullMQ as a JSON-serialized Redis value. The byte length of that serialization is the exact footprint in memory and on the wire. `Buffer.byteLength` gives the UTF-8 byte count (not the JS string character count), which matters when `args` contains Unicode values. `JSON.stringify` is synchronous, allocation-bounded, and already used throughout the file for error serialization.

**Why `Number.isInteger(envVal) && envVal > 0`?**

`Number('abc')` → `NaN`, `Number('0')` → `0`, `Number('-1')` → `-1`. All three fail the guard and fall back to the default. `Number('131072')` → `131072`, which passes. No parsing library needed.

---

### 3. Guard Integration in `addTransactionToQueue`

The guard is inserted as the **first** statement — before the wallet DB lookup, before the spend-limit check, and before any Redis or BullMQ interaction. This matches the spec's requirement and is also the cheapest possible rejection point (pure CPU, no I/O).

```typescript
export async function addTransactionToQueue(
  request: TransactionRequest
): Promise<TransactionResult> {
  // ── XDR size guard (must be first) ──────────────────────────────────
  const xdrCheck = validateXdrSize(request);
  if (!xdrCheck.valid) {
    log.warn("Rejecting oversized transaction payload", {
      sizeBytes: xdrCheck.sizeBytes,
      maxBytes: xdrCheck.maxBytes,
    });
    throw new Error(xdrCheck.error);
  }
  // ────────────────────────────────────────────────────────────────────

  // (existing spend-limit check and queue logic unchanged below)
  let userId = request.userId;
  // ...
```

The `log.warn` carries `sizeBytes` and `maxBytes` as structured fields, consistent with how the existing `log.warn` calls in `addTransactionToQueue` pass context objects (e.g., `{ error: err.message }`).

---

## Data Flow

```
addTransactionToQueue(request)
        │
        ▼
validateXdrSize(request)   ← pure, synchronous, first gate
        │
   valid: false ──────────► log.warn → throw Error("Payload too large: ...")  STOP
        │
   valid: true
        │
        ▼
wallet DB lookup (optional)
        │
        ▼
checkSpendLimit             ← existing gate
        │
        ▼
BullMQ / runTestJob         ← only reached with size-validated payload
        │
        ▼
executeTxJob → Vault → Stellar network
```

---

## Sizing Rationale

| Item | Size |
|------|------|
| Typical Soroban invocation JSON | ~500–2,000 bytes |
| Large invocation with many args | ~5,000–15,000 bytes |
| Default limit (`MAX_XDR_BYTES`) | 65,536 bytes (64 KiB) |
| Stellar protocol max transaction XDR | ~100 KiB (before base64 encoding) |

64 KiB is conservatively above any legitimate Soroban invocation serialized as JSON (the format stored in BullMQ), while being small enough to block payloads that are clearly malformed or abusive. Operators can raise the limit via `MAX_XDR_BYTES` if needed.

---

## Testing Design

**Framework:** Vitest (ESM-native, matches `"type": "module"` and `tsx` toolchain; same choice as `escrow-fund-validation` spec).

**File:** `apps/backend/wallet/src/queue/txQueue.size.test.ts`

**Mocking strategy:** All external I/O that `addTransactionToQueue` touches (Sequelize `Wallet.findOne`, `checkSpendLimit`, `getRedisConnection`, BullMQ `Queue.add`, `vaultService`) is vi-mocked at the module level so tests never make real connections.

**Test matrix:**

| Test | Input | Expected |
|------|-------|----------|
| Valid payload (default limit) | Small `TransactionRequest` | `valid: true`, correct `sizeBytes` & `maxBytes` |
| Oversized payload (default limit) | `args` padded to >65536 bytes | `valid: false`, `error` contains "Payload too large" |
| Custom `MAX_XDR_BYTES` (valid) | `process.env.MAX_XDR_BYTES = '100'`, small payload that exceeds 100 bytes | `valid: false`, `maxBytes === 100` |
| Custom `MAX_XDR_BYTES` (invalid) | `process.env.MAX_XDR_BYTES = 'abc'` | falls back, `maxBytes === 65536` |
| `addTransactionToQueue` integration | Oversized request | throws `Error` matching `/Payload too large/` |
| `addTransactionToQueue` pass-through | Valid request | `validateXdrSize` called but downstream mock returns expected result |

---

## Dependencies

| Package | Purpose | Type |
|---------|---------|------|
| `vitest` | Test runner | devDependency |

`vitest` is the only addition. Pinned to `^2.0.0` consistent with the `escrow-fund-validation` spec.

---

## What Is Not Changing

- `executeTxJob` — no modifications
- `runTestJob` — no modifications
- `initQueue` / `closeQueue` — no modifications
- `getRedisConnection` — no modifications
- `LedgerSubmissionCheck` interface — no modifications
- Any file outside `apps/backend/wallet/` — no modifications (except `.env.example` comment)
