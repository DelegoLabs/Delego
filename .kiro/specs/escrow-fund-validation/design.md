# Technical Design Document

## Overview

This document describes the technical design for adding `validateFundEscrowRequest` to `apps/backend/payments/src/validation.ts`. The implementation fits entirely within the existing hand-rolled validation infrastructure — no new libraries, no schema-generation tools. Changes are limited to `validation.ts` (new export) and a new `validation.test.ts` file.

---

## Architecture

### Affected Files

| File | Change |
|------|--------|
| `apps/backend/payments/src/validation.ts` | Add `FundEscrowRequest` interface + `validateFundEscrowRequest` function |
| `apps/backend/payments/src/validation.test.ts` | New — Vitest unit tests |
| `apps/backend/payments/package.json` | Update `test` script to `vitest run`; add `vitest` as dev dependency |

No other files change. `routes.ts`, `escrow/`, and all other modules are read-only from this feature's perspective.

---

## Component Design

### 1. `FundEscrowRequest` Interface

```typescript
export interface FundEscrowRequest {
  orderId: string;
  buyerWalletId: string;
  merchantAddress: string;   // Stellar G-address, validated
  amountStroops: string;     // Decimal integer string, 1 ≤ value ≤ MAX_SAFE_INTEGER
  idempotencyKey: string;    // UUID v4
}
```

All fields are `string`. `amountStroops` is intentionally a string (not `bigint` or `number`) to match the existing `TransactionRequest.amountStroops: string` pattern in `@delego/types` and to avoid precision loss at the boundary.

---

### 2. Private Validation Helpers (new, file-scoped)

Two new file-private helpers are added below the existing ones. They follow the identical signature pattern.

#### `requireStroops`

```typescript
function requireStroops(
  body: Record<string, unknown>,
  field: string
): ValidationResult<string>
```

Logic:
1. Call `requireString(body, field)` — handles missing/empty/non-string.
2. Test `/^\d+$/` — rejects decimals, negatives, leading signs, whitespace.
3. Parse as `BigInt` and compare: `value === 0n` → reject; `value > BigInt(Number.MAX_SAFE_INTEGER)` → reject.
4. Return `{ ok: true, value: trimmedString }`.

Using `BigInt` for the overflow comparison avoids the irony of using `Number` to guard against overflow. The returned value stays a string.

#### `requireUuidV4`

```typescript
function requireUuidV4(
  body: Record<string, unknown>,
  field: string
): ValidationResult<string>
```

Logic:
1. Call `requireString(body, field)`.
2. Test `/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i` — standard RFC 4122 v4 pattern.
3. Return `{ ok: true, value: trimmedString }` (lowercased to normalise case).

---

### 3. `validateFundEscrowRequest` Function

```typescript
export function validateFundEscrowRequest(
  body: Record<string, unknown>
): ValidationResult<FundEscrowRequest> {
  const orderId = requireString(body, "orderId");
  if (!orderId.ok) return orderId;

  const buyerWalletId = requireString(body, "buyerWalletId");
  if (!buyerWalletId.ok) return buyerWalletId;

  const merchantAddress = requireStellarAddress(body, "merchantAddress");
  if (!merchantAddress.ok) return merchantAddress;

  const amountStroops = requireStroops(body, "amountStroops");
  if (!amountStroops.ok) return amountStroops;

  const idempotencyKey = requireUuidV4(body, "idempotencyKey");
  if (!idempotencyKey.ok) return idempotencyKey;

  return {
    ok: true,
    value: {
      orderId: orderId.value,
      buyerWalletId: buyerWalletId.value,
      merchantAddress: merchantAddress.value,
      amountStroops: amountStroops.value,
      idempotencyKey: idempotencyKey.value,
    },
  };
}
```

Field validation order is fixed: `orderId` → `buyerWalletId` → `merchantAddress` → `amountStroops` → `idempotencyKey`. First failure short-circuits and returns; no error accumulation.

---

### 4. Execution Guard Pattern (route handler usage)

The return type `ValidationResult<FundEscrowRequest>` plugs directly into the existing route guard pattern with zero changes to `routes.ts`:

```typescript
// In a future route handler — illustrative, not a code change:
const validated = validateFundEscrowRequest(body);
if (!validated.ok) {
  sendValidationError(res, validated.error);  // validated.error: ValidationError ✓
  return;
}
// validated.value: FundEscrowRequest — all five fields typed as string ✓
await walletClient.fundEscrow(validated.value);
```

No type casting is needed because `sendValidationError` already accepts `ValidationError` and `validated.value` is narrowed to `FundEscrowRequest` by the discriminated union.

---

### 5. amountStroops Overflow Guard — Design Rationale

JavaScript's `Number` silently rounds integers above `2^53 - 1` (9007199254740991). If a downstream service calls `Number(amountStroops)` on an unvalidated string larger than this, the result is incorrect without any error. The validation rejects strings above `MAX_SAFE_INTEGER` at the HTTP boundary, making the overflow impossible before the value reaches any numeric conversion.

`BigInt` is used only inside `requireStroops` for the comparison — it is not part of the public interface or returned value.

---

## Data Flow

```
HTTP POST body (raw)
        │
        ▼
readJsonBody()        ← existing utility, no change
        │
        ▼
validateFundEscrowRequest(body)
        │
   ok: false ──────► sendValidationError(res, error)  → 400 response, STOP
        │
   ok: true
        │
        ▼
validated.value: FundEscrowRequest
        │
        ▼
walletClient / escrowService  ← only reached with clean, bounded data
```

---

## Testing Design

**Framework:** Vitest (ESM-native, matches the project's `"type": "module"` and `tsx` toolchain).

**File:** `apps/backend/payments/src/validation.test.ts`

**Test categories:**

| Category | Cases |
|----------|-------|
| Happy path | All 5 valid fields → `ok: true`, trimmed values asserted |
| Missing fields | 5 tests × missing each field → `ok: false`, correct `details.field` |
| Empty/whitespace | 5 tests × empty string → `ok: false`, correct `details.field` |
| merchantAddress format | Invalid Stellar address → `ok: false`, `details.field: 'merchantAddress'` |
| amountStroops — zero | `'0'` → `ok: false` |
| amountStroops — overflow | `'9007199254740992'` → `ok: false` |
| amountStroops — non-digit | `'123.45'`, `'-1'` → `ok: false` |
| idempotencyKey format | `'not-a-uuid'`, v1 UUID → `ok: false`, `details.field: 'idempotencyKey'` |
| Fail-fast order | Body with both invalid `orderId` and invalid `amountStroops` → error for `orderId` |

No mocks, no network calls. All tests are pure function calls against `validateFundEscrowRequest`.

---

## Dependencies

| Package | Purpose | Type |
|---------|---------|------|
| `vitest` | Test runner | devDependency |

`vitest` is the only addition. Version pinned to `^2.0.0` to match the monorepo's existing usage in the wallet service.

---

## What Is Not Changing

- `routes.ts` — no modifications
- `escrow/` — no modifications  
- Any other service — no modifications
- The existing `ValidationResult<T>`, `ValidationError`, `missingField`, `invalidField`, `requireString`, `requireStellarAddress` helpers — read-only
