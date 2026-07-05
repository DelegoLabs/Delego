# Requirements Document

## Introduction

This feature adds a persistent audit trail for wallet signing attempts in the Delego platform. Every time the wallet service attempts to sign and submit a Stellar transaction — whether the attempt succeeds or fails — a structured record is written to a dedicated database table. This log enables security auditing, incident investigation, and operational monitoring without ever exposing sensitive cryptographic material.

**Critical security constraint:** Private keys, seed phrases, mnemonics, raw secrets, or any other cryptographic key material MUST NOT appear in the audit log table, in application logs, or in any intermediate data structure passed to the audit logging subsystem.

## Glossary

- **Audit_Logger**: The repository helper module responsible for inserting records into `wallet_signing_audit_logs`. It accepts only safe, non-sensitive fields.
- **Transaction_Service**: The Stellar transaction submission flow implemented in `apps/backend/wallet/src/queue/txQueue.ts` (the `executeTxJob` function and its callers), which orchestrates signing and on-chain submission.
- **Wallet_Signing_Audit_Log**: A single database row in `wallet_signing_audit_logs` representing one signing attempt.
- **tx_hash**: The hexadecimal hash of a Stellar transaction, available only after a successful submission. NULL when the attempt fails before a hash is produced.
- **wallet_id**: The UUID primary key from the `wallets` table that identifies which wallet initiated the signing attempt.
- **status**: A VARCHAR(32) field recording the outcome of a signing attempt. Valid values are `SUCCESS` and `FAILURE`.
- **Migration**: A numbered SQL file stored under `database/migrations/` that is applied to the PostgreSQL database to evolve the schema.

---

## Requirements

### Requirement 1: Database Migration

**User Story:** As a platform operator, I want a dedicated table to store signing audit records, so that I can query and retain a structured history of all signing attempts.

#### Acceptance Criteria

1. THE Migration SHALL create the table `wallet_signing_audit_logs` using `CREATE TABLE IF NOT EXISTS` with the following columns: `id` (UUID primary key, default `gen_random_uuid()`), `wallet_id` (UUID, NOT NULL), `tx_hash` (VARCHAR(128), nullable), `status` (VARCHAR(32), NOT NULL, CHECK constraint limiting values to `'SUCCESS'` and `'FAILURE'`), and `created_at` (TIMESTAMPTZ, default `NOW()`). An index SHALL be created on `wallet_id` to support lookup queries consistent with the project-wide pattern.
2. THE Migration SHALL follow the existing numeric prefix naming convention used by files in `database/migrations/` (e.g., `004_wallet_signing_audit.sql`).
3. WHEN the migration is applied to a database that already contains the `wallets` table or when it is re-applied to a database where `wallet_signing_audit_logs` already exists, THE Migration SHALL complete without error due to `IF NOT EXISTS` guards.
4. THE Migration SHALL NOT add a foreign key constraint from `wallet_signing_audit_logs.wallet_id` to `wallets.id`, so that audit records are retained even if the associated wallet is later deleted.

### Requirement 2: Audit Logger Helper

**User Story:** As a backend developer, I want a typed helper function for inserting audit log records, so that the rest of the codebase can log signing attempts through a single, well-defined interface.

#### Acceptance Criteria

1. THE Audit_Logger SHALL expose a function `insertAuditLog` that accepts a plain object typed as `{ walletId: string; status: 'SUCCESS' | 'FAILURE'; txHash?: string | null }`, where `walletId` is a UUID v4 string, `txHash` is an optional string of at most 128 characters or null, and the function returns `Promise<void>`.
2. WHEN `insertAuditLog` is called, THE Audit_Logger SHALL insert exactly one row into `wallet_signing_audit_logs` — writing `wallet_id`, `tx_hash`, and `status` — using the Sequelize instance already initialised in `apps/backend/wallet/src/db.ts`. The `id` and `created_at` columns SHALL be server-generated and SHALL NOT be supplied by the helper.
3. THE Audit_Logger's TypeScript parameter type SHALL produce a compile-time error if a caller attempts to pass any field named `privateKey`, `secretKey`, `secret`, `seedPhrase`, `mnemonic`, or `encryptedPrivateKey`, ensuring secret isolation is enforced at the type level rather than at runtime.
4. IF the database insert fails, THEN THE Audit_Logger SHALL re-throw the error so the caller can handle it; no partial row SHALL remain in `wallet_signing_audit_logs` after a failed insert.
5. THE Audit_Logger SHALL be located within `apps/backend/wallet/src/transactions/` to keep it co-located with the signing flow.

### Requirement 3: Integration into the Transaction Signing Flow

**User Story:** As a security engineer, I want every signing attempt to produce an audit record, so that I can reconstruct the history of signing events during incident investigations.

#### Acceptance Criteria

1. WHEN `executeTxJob` in `apps/backend/wallet/src/queue/txQueue.ts` completes a Stellar transaction successfully (i.e., `rpcServer.getTransaction` returns `SUCCESS`), THE Transaction_Service SHALL call `insertAuditLog` with `status: 'SUCCESS'` and the confirmed `txHash` before returning the `TransactionResult`.
2. WHEN `executeTxJob` propagates a fatal error (non-transient) that permanently fails the signing attempt, THE Transaction_Service SHALL call `insertAuditLog` with `status: 'FAILURE'` and `txHash: null`. For transient errors that trigger a BullMQ retry, `insertAuditLog` SHALL NOT be called until the final attempt outcome is determined.
3. THE Transaction_Service SHALL derive `walletId` from `request.walletId` already resolved during the spend-limit check. IF `request.walletId` is null or undefined at the point of logging, THEN THE Transaction_Service SHALL skip the `insertAuditLog` call and log a warning via `log.warn`; it SHALL NOT perform an additional database query solely for audit logging.
4. IF `insertAuditLog` throws an error, THEN THE Transaction_Service SHALL catch the error, log it using the existing `log.error` logger, and SHALL NOT re-throw it, so that an audit log failure does not abort or mask the primary transaction result.
5. THE Transaction_Service SHALL call `insertAuditLog` only after the final outcome is known: for success, after `getTransaction` returns `SUCCESS`; for failure, after the `catch` block in `executeTxJob` determines the error is fatal. It SHALL NOT call `insertAuditLog` before the signing and submission steps are complete.

### Requirement 4: Secret Isolation

**User Story:** As a security engineer, I want a guarantee that no secret key material is ever passed to or stored by the audit logger, so that a database compromise does not expose private keys.

#### Acceptance Criteria

1. THE Audit_Logger's `insertAuditLog` function parameter type SHALL NOT include any field named `privateKey`, `secretKey`, `secret`, `seedPhrase`, `mnemonic`, `encryptedPrivateKey`, or any field typed as the vault ciphertext record shape `{ iv: string; tag: string; encryptedData: string; salt: string }`.
2. WHEN `insertAuditLog` is called anywhere in the codebase, THE Transaction_Service SHALL NOT pass the `secret` variable (the decrypted private key returned by `vaultService.getKey`), the `signerKeypair` object, or any vault ciphertext record object to `insertAuditLog`.
3. THE Audit_Logger SHALL NOT import or call `vaultService`, any module that exports a `getKey` function, or any other utility whose primary purpose is retrieving or decrypting cryptographic key material from Vault or external secret storage.
4. THE Wallet_Signing_Audit_Log record persisted to the database SHALL contain only the fields: `id`, `wallet_id`, `tx_hash`, `status`, and `created_at`. No additional columns derived from key material SHALL be added without a new migration and a corresponding requirements update.
5. WITHIN `executeTxJob`, no intermediate wrapper object, struct, or parameter bag that contains the `secret` variable or `signerKeypair` SHALL be constructed and then passed — directly or indirectly — to `insertAuditLog`.

### Requirement 5: Unit and Contract Tests

**User Story:** As a developer, I want automated tests for the audit logging path, so that regressions in signing-attempt logging are caught before they reach production.

#### Acceptance Criteria

1. WHEN `insertAuditLog` is called with `status: 'SUCCESS'`, a valid `txHash` (a 64-character hexadecimal string), and a valid `walletId` (a UUID v4 string), THE test suite SHALL assert that the mocked Sequelize `create` call was invoked exactly once with arguments containing `wallet_id` equal to the supplied `walletId`, `tx_hash` equal to the supplied hash, and `status` equal to `'SUCCESS'`.
2. WHEN `insertAuditLog` is called with `status: 'FAILURE'` and `txHash` set to `null`, THE test suite SHALL assert that the mocked Sequelize `create` call was invoked exactly once with arguments containing `status` equal to `'FAILURE'`, `tx_hash` equal to `null`, and `wallet_id` equal to the supplied `walletId`.
3. THE test suite SHALL contain an explicit TypeScript compile-time assertion (using a type-level test utility such as `@ts-expect-error` or a `satisfies` check) that verifies passing a field named `privateKey`, `secretKey`, `secret`, `seedPhrase`, `mnemonic`, or `encryptedPrivateKey` to `insertAuditLog` produces a type error.
4. THE test suite SHALL mock the Sequelize `create` call using the project's test framework (Jest or Vitest) so that tests run without a live database connection. The mock SHALL be configured to resolve with a stub object, and each test SHALL assert on the mock's call arguments rather than the stub return value.
5. THE test suite SHALL be located at `apps/backend/wallet/src/transactions/auditLog.test.ts` alongside the Audit_Logger helper, and the `package.json` for the wallet service SHALL include a `test` script that executes this file (e.g., `vitest run` or `jest`).
