# Requirements Document

## Introduction

This feature adds strict input validation for escrow funding requests in the Delego payments service. A `validateFundEscrowRequest` function parses and validates a raw HTTP request body against the `FundEscrowRequest` contract before any downstream wallet or smart-contract client is invoked. This prevents malformed data, integer overflows from large numeric strings, and missing required fields from reaching the transaction layer.

**Scope constraint:** All changes are limited to `apps/backend/payments/src/validation.ts` (and a co-located test file). No new dependencies are introduced; the implementation follows the existing hand-rolled `ValidationResult<T>` pattern already present in that file.

## Glossary

- **FundEscrowRequest**: The validated data contract for escrow funding. Contains `orderId`, `buyerWalletId`, `merchantAddress`, `amountStroops`, and `idempotencyKey`.
- **amountStroops**: A decimal integer encoded as a string, representing a Stellar XLM amount in stroops (1 XLM = 10,000,000 stroops). Stored as a string to avoid JavaScript number precision loss.
- **merchantAddress**: A Stellar account address starting with `G` (StrKey G-address format, 56 characters).
- **idempotencyKey**: A UUID v4 string used to deduplicate funding requests.
- **ValidationResult\<T\>**: The existing discriminated union `{ ok: true; value: T } | { ok: false; error: ValidationError }` defined in `validation.ts`.
- **Execution guard**: The pattern of returning early from a route handler when validation fails, preventing downstream service calls.

---

## Requirements

### Requirement 1: FundEscrowRequest Interface

**User Story:** As a backend developer, I want a typed interface for escrow funding requests, so that the compiler enforces the shape of validated data across all callers.

#### Acceptance Criteria

1. THE file `apps/backend/payments/src/validation.ts` SHALL export an interface named `FundEscrowRequest` with exactly the following fields: `orderId: string`, `buyerWalletId: string`, `merchantAddress: string`, `amountStroops: string`, and `idempotencyKey: string`. No additional fields SHALL be present on this interface.
2. THE `FundEscrowRequest` interface SHALL be usable as the value type parameter in `ValidationResult<FundEscrowRequest>` without any TypeScript compiler errors.

### Requirement 2: validateFundEscrowRequest Function

**User Story:** As a backend developer, I want a single validation function for fund-escrow requests, so that all callers share the same, centrally maintained validation logic.

#### Acceptance Criteria

1. THE file `apps/backend/payments/src/validation.ts` SHALL export a function `validateFundEscrowRequest(body: Record<string, unknown>): ValidationResult<FundEscrowRequest>`.
2. WHEN all five required fields are present and valid, THE function SHALL return `{ ok: true, value: FundEscrowRequest }` where each field value is the trimmed string from the input body.
3. THE function SHALL validate fields in the following order: `orderId`, `buyerWalletId`, `merchantAddress`, `amountStroops`, `idempotencyKey`. WHEN multiple fields are invalid, THE function SHALL return the error for the first invalid field in that order (fail-fast, not collect-all).
4. THE function SHALL use the existing `ValidationResult<T>`, `ValidationError`, `missingField`, and `invalidField` helpers already defined in `validation.ts`; it SHALL NOT introduce a new validation library or modify those helpers.

### Requirement 3: Field-Level Validation Rules

**User Story:** As a backend developer, I want each field in the fund-escrow request validated against its domain constraints, so that invalid data is rejected with a precise, actionable error message before reaching the transaction layer.

#### Acceptance Criteria

1. **orderId**: THE function SHALL reject the request with `code: 'VALIDATION_ERROR'` and `details.field: 'orderId'` if `orderId` is absent, not a string, or an empty/whitespace-only string.
2. **buyerWalletId**: THE function SHALL reject the request with `code: 'VALIDATION_ERROR'` and `details.field: 'buyerWalletId'` if `buyerWalletId` is absent, not a string, or an empty/whitespace-only string.
3. **merchantAddress**: THE function SHALL reject the request with `code: 'VALIDATION_ERROR'` and `details.field: 'merchantAddress'` if `merchantAddress` is absent, not a string, empty/whitespace-only, or does not match the Stellar G-address regex `^G[A-Z2-7]{55}$` (reusing the existing `isValidStellarAddress` helper from `../escrow/config.js`).
4. **amountStroops**: THE function SHALL reject the request with `code: 'VALIDATION_ERROR'` and `details.field: 'amountStroops'` if `amountStroops` is absent, not a string, empty/whitespace-only, contains any non-digit character (i.e., does not match `/^\d+$/`), represents the value `0`, or exceeds `9007199254740991` (i.e., `Number.MAX_SAFE_INTEGER`, the upper bound that prevents silent integer overflow when the value is later consumed by downstream services).
5. **idempotencyKey**: THE function SHALL reject the request with `code: 'VALIDATION_ERROR'` and `details.field: 'idempotencyKey'` if `idempotencyKey` is absent, not a string, empty/whitespace-only, or does not match the UUID v4 regex `^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$` (case-insensitive).

### Requirement 4: Execution Guard Integration Pattern

**User Story:** As a route handler author, I want a documented pattern for using `validateFundEscrowRequest` as an execution guard, so that downstream wallet and contract clients are never called with unvalidated input.

#### Acceptance Criteria

1. THE `validateFundEscrowRequest` function's return type SHALL be `ValidationResult<FundEscrowRequest>`, enabling route handlers to use the existing `sendValidationError` / early-return guard pattern already present in `routes.ts` without any changes to `routes.ts`.
2. WHEN a route handler calls `validateFundEscrowRequest` and the result has `ok: false`, the handler SHALL be able to pass `result.error` directly to `sendValidationError` without any type casting, as validated by TypeScript's structural type system.
3. WHEN a route handler calls `validateFundEscrowRequest` and the result has `ok: true`, the handler SHALL be able to access `result.value` typed as `FundEscrowRequest` — with all five fields typed as `string` — without any type casting.

### Requirement 5: Unit Tests

**User Story:** As a developer, I want automated tests for `validateFundEscrowRequest`, so that regressions in request validation are caught before they reach production.

#### Acceptance Criteria

1. THE test suite SHALL cover the happy path: a body with all five valid fields SHALL produce `{ ok: true }` with each field's trimmed value in the result.
2. THE test suite SHALL cover each of the five fields individually for the missing/empty case, asserting `ok: false`, `error.code === 'VALIDATION_ERROR'`, and `error.details.field` matching the expected field name.
3. THE test suite SHALL contain a test asserting that a `merchantAddress` failing the Stellar address regex produces `ok: false` with `details.field === 'merchantAddress'`.
4. THE test suite SHALL contain a test asserting that an `amountStroops` value of `'0'` produces `ok: false` with `details.field === 'amountStroops'`.
5. THE test suite SHALL contain a test asserting that an `amountStroops` value exceeding `Number.MAX_SAFE_INTEGER` (e.g., `'9007199254740992'`) produces `ok: false` with `details.field === 'amountStroops'`.
6. THE test suite SHALL contain a test asserting that an `idempotencyKey` that is not a valid UUID v4 (e.g., `'not-a-uuid'`) produces `ok: false` with `details.field === 'idempotencyKey'`.
7. THE test suite SHALL use Vitest (to be added as a dev dependency) with no live network or database connections. The `package.json` for the payments service SHALL be updated to include a `test` script that runs `vitest run`.
8. THE test file SHALL be located at `apps/backend/payments/src/validation.test.ts`.
