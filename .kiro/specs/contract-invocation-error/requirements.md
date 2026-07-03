# Requirements Document

## Introduction

This feature introduces a unified error normalization layer for Soroban smart contract invocation failures in the Delego payments service. Currently, errors thrown by `wallet-client.ts` and re-thrown by `escrow/index.ts` are plain `Error` objects with only a free-form `message` string. Route handlers in `routes.ts` catch them generically via `sendOperationError` with no way to distinguish retryable network faults from fatal contract errors, inspect a transaction hash for incident correlation, or decide BullMQ retry policy programmatically.

This feature replaces that pattern with a typed `ContractInvocationError` class and a `normalizeContractError` helper that maps raw wallet-service errors into structured, actionable instances.

**Scope constraint:** All changes are limited to `apps/backend/payments/escrow/` and `apps/backend/payments/src/`. No changes to `@delego/types`, `@delego/utils`, `apps/backend/wallet/`, or any other service.

## Glossary

- **ContractInvocationError**: The new typed error class exported from `apps/backend/payments/escrow/errors.ts`. Extends `Error` with `code`, `retryable`, and optional `txHash` fields.
- **normalizeContractError**: A pure function that accepts an unknown thrown value and returns a `ContractInvocationError`. It inspects the error message for known patterns and assigns the appropriate `code` and `retryable` flag.
- **code**: A machine-readable string on `ContractInvocationError` identifying the error category. Valid values: `CONTRACT_SIMULATION_FAILED`, `CONTRACT_SUBMISSION_FAILED`, `CONTRACT_EXECUTION_FAILED`, `WALLET_SERVICE_UNAVAILABLE`, `WALLET_SERVICE_ERROR`, `CONTRACT_INVOCATION_FAILED` (generic fallback).
- **retryable**: A boolean on `ContractInvocationError`. `true` means the caller (BullMQ worker or route handler) may safely retry the operation. `false` means the failure is deterministic and retrying will not help.
- **txHash**: An optional string on `ContractInvocationError`. Present when the wallet service returned a transaction hash before the failure, enabling incident correlation.
- **Wallet_Client**: `apps/backend/payments/escrow/wallet-client.ts` — makes HTTP calls to the wallet service and parses responses.
- **Escrow_Service**: `apps/backend/payments/escrow/index.ts` — calls `submitContractCall` and builds `EscrowOperationResult`.

---

## Requirements

### Requirement 1: ContractInvocationError Class

**User Story:** As a backend developer, I want a typed error class for contract invocation failures, so that catch blocks across routes and workers can inspect structured fields instead of parsing free-form message strings.

#### Acceptance Criteria

1. THE file `apps/backend/payments/escrow/errors.ts` SHALL export a class `ContractInvocationError` that extends `Error` with the following additional fields: `code: string`, `retryable: boolean`, and `txHash?: string`.
2. THE constructor SHALL accept parameters `(message: string, code: string, retryable: boolean, txHash?: string)`, call `super(message)`, set `this.name = 'ContractInvocationError'`, assign all fields, and call `Object.setPrototypeOf(this, ContractInvocationError.prototype)` to preserve the TypeScript prototype chain.
3. WHEN `err instanceof ContractInvocationError` is evaluated in a catch block, IT SHALL return `true` for any instance constructed by `new ContractInvocationError(...)`, including after the value has been passed through an async boundary or serialized/deserialized within the same process.
4. THE `code` field SHALL accept any string value at construction time; the set of well-known values (`CONTRACT_SIMULATION_FAILED`, `CONTRACT_SUBMISSION_FAILED`, `CONTRACT_EXECUTION_FAILED`, `WALLET_SERVICE_UNAVAILABLE`, `WALLET_SERVICE_ERROR`, `CONTRACT_INVOCATION_FAILED`) are enforced by convention, not by a TypeScript union type, so that callers can extend with service-specific codes without modifying this file.
5. THE `stack` property of a `ContractInvocationError` instance SHALL be populated (i.e., not `undefined`) when the constructor is called, confirming that `super(message)` correctly initialises the V8 stack trace.

### Requirement 2: normalizeContractError Helper

**User Story:** As a backend developer, I want a single normalization function that converts any caught value into a `ContractInvocationError`, so that error classification logic is centralised and not duplicated across every catch block.

#### Acceptance Criteria

1. THE file `apps/backend/payments/escrow/errors.ts` SHALL export a function `normalizeContractError(err: unknown, txHash?: string): ContractInvocationError`.
2. WHEN `err` is already an instance of `ContractInvocationError`, THE function SHALL return it unchanged (identity pass-through), preserving the original `code`, `retryable`, and `txHash` fields.
3. WHEN `err` is an `Error` whose `message` contains the substring `"simulation failed"` (case-insensitive), THE function SHALL return a `ContractInvocationError` with `code: 'CONTRACT_SIMULATION_FAILED'` and `retryable: false`.
4. WHEN `err` is an `Error` whose `message` contains `"Submission failed"` or `"tx_bad_seq"` or `"bad_seq"`, THE function SHALL return a `ContractInvocationError` with `code: 'CONTRACT_SUBMISSION_FAILED'` and `retryable: true` (sequence conflicts are transient and safe to retry).
5. WHEN `err` is an `Error` whose `message` contains `"Transaction failed"` (indicating on-chain execution failure after submission), THE function SHALL return a `ContractInvocationError` with `code: 'CONTRACT_EXECUTION_FAILED'` and `retryable: false`.
6. WHEN `err` is an `Error` whose `message` contains `"Wallet service unavailable"`, THE function SHALL return a `ContractInvocationError` with `code: 'WALLET_SERVICE_UNAVAILABLE'` and `retryable: true`.
7. WHEN `err` is an `Error` whose `message` matches none of the patterns above, THE function SHALL return a `ContractInvocationError` with `code: 'WALLET_SERVICE_ERROR'` and `retryable: false`, using the original error message.
8. WHEN `err` is not an `Error` instance (e.g., a thrown string or object), THE function SHALL return a `ContractInvocationError` with `code: 'CONTRACT_INVOCATION_FAILED'`, `retryable: false`, and `message: 'An unknown contract invocation error occurred'`.
9. THE `txHash` parameter of `normalizeContractError` SHALL be forwarded to the constructed `ContractInvocationError` when the input `err` is not already a `ContractInvocationError`.
10. Pattern matching SHALL use case-insensitive substring checks (`toLowerCase().includes(...)`) so that minor message capitalisation variations do not escape classification.

### Requirement 3: Integration in wallet-client.ts

**User Story:** As a backend developer, I want the wallet client to throw `ContractInvocationError` instead of plain `Error`, so that callers receive structured errors from the first point of failure.

#### Acceptance Criteria

1. `apps/backend/payments/escrow/wallet-client.ts` SHALL import `normalizeContractError` from `./errors.js` and wrap its existing `throw new Error(...)` statements to instead throw `normalizeContractError(err)` or `normalizeContractError(new Error(message))`.
2. WHEN the `fetch` call to the wallet service throws a network error, THE `submitContractCall` function SHALL throw a `ContractInvocationError` with `code: 'WALLET_SERVICE_UNAVAILABLE'` and `retryable: true`.
3. WHEN the wallet service returns a non-OK HTTP response or a response body containing `body.error`, THE `submitContractCall` function SHALL throw a `ContractInvocationError` with `code: 'WALLET_SERVICE_ERROR'` and `retryable: false`.
4. WHEN the wallet service returns an empty `body.data`, THE `submitContractCall` function SHALL throw a `ContractInvocationError` with `code: 'WALLET_SERVICE_ERROR'` and `retryable: false`.
5. WHEN the wallet service response includes a `txHash` in `body.data`, THE thrown `ContractInvocationError` SHALL carry that `txHash` for incident correlation. IF no hash is available at the throw site, `txHash` SHALL be `undefined`.

### Requirement 4: Integration in escrow/index.ts

**User Story:** As a backend developer, I want the escrow service to re-throw `ContractInvocationError` instances transparently, so that callers of `escrowService` methods receive the same structured error without double-wrapping.

#### Acceptance Criteria

1. Each method in `escrowService` (`initialize`, `deposit`, `release`, `refund`) SHALL wrap its `await submitContractCall(...)` call in a try/catch and re-throw using `throw normalizeContractError(err)`.
2. WHEN `submitContractCall` throws a `ContractInvocationError`, `normalizeContractError` SHALL return it unchanged (per Requirement 2, AC2), so no double-wrapping occurs and the original `code`, `retryable`, and `txHash` are preserved.
3. WHEN `submitContractCall` throws a plain `Error` (e.g., from `parseEscrowId`), `normalizeContractError` SHALL classify it and produce an appropriate `ContractInvocationError`.
4. THE existing `log.info` / `log.error` calls in `escrowService` methods SHALL be preserved unchanged.

### Requirement 5: Integration in src/routes.ts

**User Story:** As an API route author, I want to inspect `ContractInvocationError.retryable` and `code` in catch blocks, so that the HTTP response status and error payload are appropriate to the failure type.

#### Acceptance Criteria

1. Each route handler catch block in `routes.ts` SHALL check `if (err instanceof ContractInvocationError)` before falling through to the generic `sendOperationError` call.
2. WHEN `err instanceof ContractInvocationError` is `true` and `err.retryable` is `false`, THE route handler SHALL respond with HTTP 422 and a body `{ data: null, error: { code: err.code, message: err.message, txHash: err.txHash ?? null } }`.
3. WHEN `err instanceof ContractInvocationError` is `true` and `err.retryable` is `true`, THE route handler SHALL respond with HTTP 503 and a body `{ data: null, error: { code: err.code, message: err.message, txHash: err.txHash ?? null } }`, signalling to the client that a retry is appropriate.
4. THE existing `sendValidationError` / `sendOperationError` pattern SHALL be retained as the fallback for non-`ContractInvocationError` errors, maintaining backward compatibility.
5. THE `ContractInvocationError` import SHALL come from `'../escrow/errors.js'`.

### Requirement 6: Unit Tests

**User Story:** As a developer, I want automated tests for the error normalization layer, so that regressions in error classification or prototype chain correctness are caught before production.

#### Acceptance Criteria

1. THE test suite SHALL assert that `new ContractInvocationError('msg', 'CODE', false)` is `instanceof ContractInvocationError`, `instanceof Error`, has `name === 'ContractInvocationError'`, `code === 'CODE'`, `retryable === false`, and a non-undefined `stack`.
2. THE test suite SHALL assert that `normalizeContractError(new ContractInvocationError(...))` returns the exact same object (identity pass-through).
3. THE test suite SHALL assert that each message pattern in Requirement 2 (AC3–AC8) produces the expected `code` and `retryable` value.
4. THE test suite SHALL assert that passing a `txHash` argument to `normalizeContractError` sets `txHash` on the returned error when the input is not already a `ContractInvocationError`.
5. THE test suite SHALL assert that passing a non-Error thrown value (e.g., the string `'oops'`) to `normalizeContractError` produces `code: 'CONTRACT_INVOCATION_FAILED'` and `retryable: false`.
6. THE test file SHALL be located at `apps/backend/payments/escrow/errors.test.ts` and the payments `package.json` `test` script SHALL be updated to run `vitest run`. `vitest` SHALL be added as a dev dependency.
