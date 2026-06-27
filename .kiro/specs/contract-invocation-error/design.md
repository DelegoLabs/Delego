# Technical Design Document

## Overview

This document describes the technical design for the `ContractInvocationError` normalization layer in the Delego payments service. The change adds one new file (`escrow/errors.ts`), modifies three existing files (`escrow/wallet-client.ts`, `escrow/index.ts`, `src/routes.ts`), adds a test file, and updates `package.json`. No new production dependencies are introduced.

---

## Architecture

### Affected Files

| File | Change |
|------|--------|
| `apps/backend/payments/escrow/errors.ts` | **New** — `ContractInvocationError` class + `normalizeContractError` helper |
| `apps/backend/payments/escrow/errors.test.ts` | **New** — Vitest unit tests |
| `apps/backend/payments/escrow/wallet-client.ts` | Modify — replace raw `throw new Error(...)` with `throw normalizeContractError(...)` |
| `apps/backend/payments/escrow/index.ts` | Modify — add try/catch around `submitContractCall` in each method |
| `apps/backend/payments/src/routes.ts` | Modify — add `ContractInvocationError` branch in each catch block |
| `apps/backend/payments/package.json` | Add `vitest` dev dependency; update `test` script |

---

## Component Design

### 1. `ContractInvocationError` Class (`escrow/errors.ts`)

```typescript
export class ContractInvocationError extends Error {
  code: string;
  txHash?: string;
  retryable: boolean;

  constructor(
    message: string,
    code: string,
    retryable: boolean,
    txHash?: string
  ) {
    super(message);
    this.name = 'ContractInvocationError';
    this.code = code;
    this.retryable = retryable;
    this.txHash = txHash;
    // Fixes `instanceof` checks after TypeScript compilation to ES5 targets
    Object.setPrototypeOf(this, ContractInvocationError.prototype);
  }
}
```

`Object.setPrototypeOf` is required because TypeScript compiles class inheritance to prototype assignment when targeting ES5, which breaks `instanceof`. The payments service targets ES2022 (`tsconfig.json` TBD), but the call is harmless and defensive — consistent with the spec requirement and the standard Node.js custom error pattern.

---

### 2. `normalizeContractError` Helper (`escrow/errors.ts`)

The classifier applies patterns in priority order. The first matching pattern wins (short-circuit). Patterns are checked against `err.message.toLowerCase()`.

```
Priority | Pattern substring (case-insensitive) | code                         | retryable
---------|--------------------------------------|------------------------------|----------
0        | err instanceof ContractInvocationError| — (identity pass-through)    | —
1        | "simulation failed"                  | CONTRACT_SIMULATION_FAILED   | false
2        | "submission failed" OR "tx_bad_seq"  | CONTRACT_SUBMISSION_FAILED   | true
         | OR "bad_seq"                         |                              |
3        | "transaction failed"                 | CONTRACT_EXECUTION_FAILED    | false
4        | "wallet service unavailable"         | WALLET_SERVICE_UNAVAILABLE   | true
5        | any other Error                      | WALLET_SERVICE_ERROR         | false
6        | non-Error thrown value               | CONTRACT_INVOCATION_FAILED   | false
```

The pattern substrings are derived directly from the error messages already thrown in `wallet-client.ts` (`"Wallet service unavailable: ..."`, `"Submission failed: ..."`) and `txQueue.ts` (`"Transaction simulation failed: ..."`, `"Transaction failed: ..."`, `"Submission failed: ..."`), ensuring every message the payments service will actually receive is classified.

```typescript
export function normalizeContractError(
  err: unknown,
  txHash?: string
): ContractInvocationError {
  // Identity pass-through — avoids double-wrapping
  if (err instanceof ContractInvocationError) return err;

  if (err instanceof Error) {
    const msg = err.message.toLowerCase();

    if (msg.includes("simulation failed")) {
      return new ContractInvocationError(
        err.message, "CONTRACT_SIMULATION_FAILED", false, txHash
      );
    }
    if (
      msg.includes("submission failed") ||
      msg.includes("tx_bad_seq") ||
      msg.includes("bad_seq")
    ) {
      return new ContractInvocationError(
        err.message, "CONTRACT_SUBMISSION_FAILED", true, txHash
      );
    }
    if (msg.includes("transaction failed")) {
      return new ContractInvocationError(
        err.message, "CONTRACT_EXECUTION_FAILED", false, txHash
      );
    }
    if (msg.includes("wallet service unavailable")) {
      return new ContractInvocationError(
        err.message, "WALLET_SERVICE_UNAVAILABLE", true, txHash
      );
    }
    // Generic wallet-service error (non-OK HTTP, empty body, etc.)
    return new ContractInvocationError(
      err.message, "WALLET_SERVICE_ERROR", false, txHash
    );
  }

  // Non-Error thrown value (string, object, null, etc.)
  return new ContractInvocationError(
    "An unknown contract invocation error occurred",
    "CONTRACT_INVOCATION_FAILED",
    false,
    txHash
  );
}
```

---

### 3. Changes to `wallet-client.ts`

Three throw sites are updated. No logic changes — only the error type changes.

```typescript
// BEFORE (network error):
throw new Error(`Wallet service unavailable: ${message}`);

// AFTER:
throw normalizeContractError(new Error(`Wallet service unavailable: ${message}`));
// → ContractInvocationError { code: 'WALLET_SERVICE_UNAVAILABLE', retryable: true }
```

```typescript
// BEFORE (non-OK response / body.error):
throw new Error(message);  // message = body.error?.message or "Wallet service returned status N"

// AFTER:
throw normalizeContractError(new Error(message));
// → ContractInvocationError { code: 'WALLET_SERVICE_ERROR', retryable: false }
```

```typescript
// BEFORE (empty body.data):
throw new Error("Wallet service returned empty transaction result");

// AFTER:
throw normalizeContractError(new Error("Wallet service returned empty transaction result"));
// → ContractInvocationError { code: 'WALLET_SERVICE_ERROR', retryable: false }
```

`txHash` is not available at any of these throw sites (the wallet client hasn't received a hash yet), so it remains `undefined`.

---

### 4. Changes to `escrow/index.ts`

Each of the four `escrowService` methods wraps its `await submitContractCall(...)` in a try/catch. The catch simply calls `throw normalizeContractError(err)`, which is a no-op for errors that are already `ContractInvocationError` (pass-through) and classifies plain `Error` values like those from `parseEscrowId`.

```typescript
// Example: deposit method
async deposit(params: DepositEscrowParams): Promise<EscrowOperationResult> {
  const contractId = getEscrowContractId();
  // ... existing log.info ...
  try {
    const tx = await submitContractCall({ ... });
    // ... existing log.info ...
    return toEscrowResult(tx);
  } catch (err) {
    throw normalizeContractError(err);
  }
},
```

All four methods follow the same pattern. The `parseEscrowId` call for `release` and `refund` is outside the try/catch since its `Error` is a programming/validation error (bad escrow ID), not a contract invocation error. It remains a plain `Error` and falls through to `sendOperationError` in the route handler, which is the correct behaviour.

---

### 5. Changes to `src/routes.ts`

Each route catch block adds a `ContractInvocationError` branch before the existing `sendOperationError` fallback.

```typescript
// Example: /escrow/deposit catch block
} catch (err) {
  if (err instanceof Error && err.message === "Invalid JSON body") {
    sendValidationError(res, { code: "VALIDATION_ERROR", message: "Invalid JSON body" });
    return;
  }
  if (err instanceof ContractInvocationError) {
    const status = err.retryable ? 503 : 422;
    json(res, status, {
      data: null,
      error: { code: err.code, message: err.message, txHash: err.txHash ?? null },
    });
    return;
  }
  sendOperationError(res, "ESCROW_DEPOSIT_FAILED", err);
}
```

HTTP status mapping:
- `retryable: true` → **503 Service Unavailable** — tells the caller the operation is safe to retry (network issue, sequence conflict).
- `retryable: false` → **422 Unprocessable Entity** — tells the caller the operation failed deterministically (simulation error, contract rejection). Retrying without changing inputs will not help.

This is consistent with how BullMQ's own retry policy uses the `retryable` flag: a worker catching `ContractInvocationError` can check `err.retryable` to decide whether to let BullMQ retry the job or mark it permanently failed.

---

## Error Flow (end-to-end)

```
Route handler
    │
    ▼
escrowService.deposit(params)
    │
    ├── try
    │       submitContractCall(request)
    │           │
    │           ├── fetch() throws  → normalizeContractError()
    │           │                     ContractInvocationError {
    │           │                       code: 'WALLET_SERVICE_UNAVAILABLE',
    │           │                       retryable: true
    │           │                     }
    │           │
    │           └── response.ok=false → normalizeContractError()
    │                                   ContractInvocationError {
    │                                     code: 'WALLET_SERVICE_ERROR',
    │                                     retryable: false
    │                                   }
    │
    └── catch(err)
            normalizeContractError(err)  ← pass-through if already typed
            throw ContractInvocationError
                │
                ▼
        Route catch block
            instanceof ContractInvocationError?
            ├── YES, retryable=true  → HTTP 503
            ├── YES, retryable=false → HTTP 422
            └── NO                  → sendOperationError → HTTP 400
```

---

## Testing Design

**Framework:** Vitest. **File:** `apps/backend/payments/escrow/errors.test.ts`.

No mocks needed — `errors.ts` is a pure module with no I/O. All tests are direct function calls.

**Test matrix:**

| Test | Input | Expected |
|------|-------|----------|
| instanceof checks | `new ContractInvocationError(...)` | `instanceof ContractInvocationError` and `instanceof Error` both `true` |
| prototype chain | `new ContractInvocationError(...)` | `name === 'ContractInvocationError'`, `stack` not undefined |
| pass-through | `normalizeContractError(existingCIE)` | same object reference returned |
| simulation failed | `new Error("Transaction simulation failed: ...")` | `code: 'CONTRACT_SIMULATION_FAILED'`, `retryable: false` |
| submission failed | `new Error("Submission failed: ...")` | `code: 'CONTRACT_SUBMISSION_FAILED'`, `retryable: true` |
| bad_seq | `new Error("tx_bad_seq encountered")` | `code: 'CONTRACT_SUBMISSION_FAILED'`, `retryable: true` |
| transaction failed | `new Error("Transaction failed: XDR")` | `code: 'CONTRACT_EXECUTION_FAILED'`, `retryable: false` |
| wallet unavailable | `new Error("Wallet service unavailable: ECONNREFUSED")` | `code: 'WALLET_SERVICE_UNAVAILABLE'`, `retryable: true` |
| generic Error | `new Error("Some other error")` | `code: 'WALLET_SERVICE_ERROR'`, `retryable: false` |
| non-Error | `normalizeContractError("oops")` | `code: 'CONTRACT_INVOCATION_FAILED'`, `retryable: false` |
| txHash forwarding | `normalizeContractError(new Error("..."), "abc123")` | `txHash === 'abc123'` |
| txHash not forwarded to pass-through | `normalizeContractError(existingCIE, "newHash")` | original `txHash` unchanged |

---

## Dependencies

| Package | Purpose | Type |
|---------|---------|------|
| `vitest` | Test runner | devDependency |

No new production dependencies.

---

## What Is Not Changing

- `escrow/types.ts` — no modifications
- `escrow/config.ts` — no modifications
- `src/index.ts` — no modifications
- `src/validation.ts` — no modifications
- Any file outside `apps/backend/payments/` — no modifications
- `@delego/types` — no modifications
