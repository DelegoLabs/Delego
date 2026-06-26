# Requirements Document

## Introduction

This feature adds a gateway-level size guard to `apps/backend/wallet/src/queue/txQueue.ts`. Before a `TransactionRequest` is enqueued or executed, the serialized JSON representation of the request payload is measured in bytes. If it exceeds a configurable maximum, the request is rejected immediately — before any BullMQ job is created, before any Vault key is fetched, and before any Stellar network call is made. This prevents memory bloat in the Redis queue, protects downstream workers from malformed or intentionally oversized payloads, and provides callers with a structured, inspectable rejection result.

**Scope constraint:** All changes are limited to `apps/backend/wallet/src/queue/txQueue.ts` and a co-located test file `apps/backend/wallet/src/queue/txQueue.size.test.ts`. No new production dependencies are introduced.

## Glossary

- **XdrValidationResult**: The exported interface `{ valid: boolean; sizeBytes: number; maxBytes: number; error?: string }` returned by `validateXdrSize`. Carries the raw measurements regardless of pass/fail so callers can log or surface them.
- **validateXdrSize**: The exported pure function that measures the serialized byte size of a `TransactionRequest` and compares it to the configured maximum.
- **MAX_XDR_BYTES**: The default byte-size ceiling for a serialized `TransactionRequest`. Set to `65536` (64 KiB). Overridable via the `MAX_XDR_BYTES` environment variable.
- **Payload size**: The byte length of `Buffer.byteLength(JSON.stringify(request), 'utf8')`. This measures the UTF-8 encoding of the JSON serialization of the entire `TransactionRequest` object, which is also the form stored in the BullMQ Redis job.
- **addTransactionToQueue**: The existing exported function in `txQueue.ts` that is the single entry point for all callers enqueuing transactions.

---

## Requirements

### Requirement 1: XdrValidationResult Interface

**User Story:** As a backend developer, I want a structured result type for XDR size validation, so that callers receive inspectable metadata about why a request was rejected.

#### Acceptance Criteria

1. THE file `apps/backend/wallet/src/queue/txQueue.ts` SHALL export an interface named `XdrValidationResult` with exactly the following fields: `valid: boolean`, `sizeBytes: number`, `maxBytes: number`, and `error?: string`.
2. WHEN `valid` is `true`, THE `error` field SHALL be absent (or `undefined`).
3. WHEN `valid` is `false`, THE `error` field SHALL be a non-empty string describing why the payload was rejected.
4. THE `sizeBytes` and `maxBytes` fields SHALL always be populated with positive integers regardless of the `valid` value, so that callers can log the exact measurements in both passing and failing cases.

### Requirement 2: validateXdrSize Function

**User Story:** As a backend developer, I want a pure, exported function to measure and validate payload size, so that the check is independently testable and reusable.

#### Acceptance Criteria

1. THE file `apps/backend/wallet/src/queue/txQueue.ts` SHALL export a function `validateXdrSize(request: TransactionRequest): XdrValidationResult`.
2. THE function SHALL compute `sizeBytes` as `Buffer.byteLength(JSON.stringify(request), 'utf8')`.
3. THE function SHALL read `maxBytes` from `Number(process.env.MAX_XDR_BYTES ?? 65536)`. If the environment variable is set but parses to `NaN` or a non-positive integer, THE function SHALL fall back to `65536`.
4. WHEN `sizeBytes <= maxBytes`, THE function SHALL return `{ valid: true, sizeBytes, maxBytes }`.
5. WHEN `sizeBytes > maxBytes`, THE function SHALL return `{ valid: false, sizeBytes, maxBytes, error: \`Payload too large: \${sizeBytes} bytes exceeds limit of \${maxBytes} bytes\` }`.
6. THE function SHALL be a pure synchronous function with no side effects; it SHALL NOT log, throw, or modify the request object.

### Requirement 3: Integration into addTransactionToQueue

**User Story:** As a system operator, I want oversized transaction payloads rejected before they reach the queue, so that Redis memory and worker capacity are protected from malformed or malicious requests.

#### Acceptance Criteria

1. THE `addTransactionToQueue` function SHALL call `validateXdrSize(request)` as its **first** operation, before the spend-limit check, before the wallet DB lookup, and before any BullMQ queue interaction.
2. WHEN `validateXdrSize` returns `{ valid: false }`, THE `addTransactionToQueue` function SHALL throw an `Error` with the message from `XdrValidationResult.error` and SHALL NOT proceed to any downstream operation (no DB queries, no Redis writes, no Vault calls).
3. WHEN `validateXdrSize` returns `{ valid: true }`, THE `addTransactionToQueue` function SHALL proceed with the existing spend-limit and queue logic unchanged.
4. THE `addTransactionToQueue` function SHALL log a `log.warn` message including `sizeBytes` and `maxBytes` before throwing when a payload is rejected, using the existing `log` instance.

### Requirement 4: Configurable Size Limit

**User Story:** As a platform operator, I want the XDR size limit to be configurable via an environment variable, so that I can tune the threshold without a code change.

#### Acceptance Criteria

1. THE default maximum SHALL be `65536` bytes (64 KiB) when `MAX_XDR_BYTES` is not set.
2. WHEN `MAX_XDR_BYTES` is set to a valid positive integer string (e.g., `'131072'`), `validateXdrSize` SHALL use that value as `maxBytes`.
3. WHEN `MAX_XDR_BYTES` is set to an invalid value (e.g., `'abc'`, `'0'`, `'-1'`), `validateXdrSize` SHALL fall back to `65536` and SHALL NOT throw.
4. THE `.env.example` file at the repository root SHALL include a commented entry `# MAX_XDR_BYTES=65536` documenting the variable.

### Requirement 5: Unit Tests

**User Story:** As a developer, I want automated tests for the XDR size guard, so that regressions in payload validation are caught before they reach production.

#### Acceptance Criteria

1. THE test suite SHALL cover the case where a payload within the default limit produces `{ valid: true }` with correct `sizeBytes` and `maxBytes` values.
2. THE test suite SHALL cover the case where a payload exceeding the default limit produces `{ valid: false }` with a non-empty `error` string and correct `sizeBytes` and `maxBytes` values.
3. THE test suite SHALL cover the case where `MAX_XDR_BYTES` is set to a custom valid value and `validateXdrSize` uses that value as `maxBytes`.
4. THE test suite SHALL cover the case where `MAX_XDR_BYTES` is set to an invalid value (e.g., `'abc'`) and `validateXdrSize` falls back to `65536`.
5. THE test suite SHALL assert that `addTransactionToQueue` throws an `Error` containing the word "Payload too large" when called with an oversized request, verifying the integration guard in Requirement 3.
6. THE test suite SHALL use Vitest (to be added as a dev dependency to the wallet `package.json`) with no live Redis, BullMQ, Vault, or Stellar network connections. All external I/O SHALL be mocked.
7. THE test file SHALL be located at `apps/backend/wallet/src/queue/txQueue.size.test.ts` and the wallet `package.json` `test` script SHALL be updated to `vitest run`.
