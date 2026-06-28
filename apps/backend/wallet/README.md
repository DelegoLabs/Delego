# @delego/wallet

Delego **wallet** service.

## Development

```bash
pnpm --filter @delego/wallet dev
```

Health check: `GET http://localhost:3012/health`

## Public Key Validation

This service uses `@delego/utils` to validate Stellar public keys at route boundaries, and
`normalizeStellarAddress` in `src/normalizeStellarAddress.ts` before account lookups and persistence.

| Export | Purpose |
|---|---|
| `validatePublicKey(key)` | Returns `{ valid, normalized?, error? }` — trims whitespace, rejects secret seeds (`S...`), validates Ed25519 public key (`G...`) |
| `isValidStellarPublicKey(key)` | Boolean shorthand for `validatePublicKey(key).valid` |
| `validatePublicKeyMiddleware(paramName)` | Express middleware that validates a route param and responds with HTTP 400 on failure |
| `normalizeStellarAddress(input)` | Returns `{ original, normalized, valid }` — trims whitespace, rejects secret seeds and malformed StrKey values per SDK behavior; used by `stellar/account.ts` before Horizon and vault lookups |

Malformed keys and secret keys are rejected before processing.

## Transaction Submission Retry Classification

`classifySubmissionFailure` in `src/queue/submissionFailure.ts` (re-exported from `txQueue.ts`) maps thrown submission errors to a `SubmissionFailure` before BullMQ requeues jobs:

| Field | Purpose |
|---|---|
| `code` | Stable failure code (e.g. `TX_RPC_TRANSIENT`, `TX_MALFORMED_XDR`) |
| `message` | Original error message |
| `retryable` | `true` for network/RPC faults, sequence conflicts, and poll timeouts; `false` for malformed XDR, auth failures, simulation, and on-chain execution errors |
| `txHash` | Optional hash when known at failure time |

Retryable failures are rethrown as standard errors so BullMQ applies backoff. Terminal failures throw `UnrecoverableError` to stop retries immediately.

## Security & Encryption

### Hot Wallet Seed Phrase Encryption
To secure hot wallet secrets, BIP-39 seed phrases must be encrypted before being persisted. We use `aes-256-gcm` authenticated encryption:
- **Key Derivation**: The encryption key is derived by hashing the `WALLET_MASTER_SECRET` via SHA-256 to ensure a secure 32-byte key.
- **Initialization Vector**: A random 12-byte IV is generated for each encryption operation.
- **Authentication**: A 16-byte authentication tag is generated and validated on decryption to ensure integrity and prevent tampering.

### Key Rotation and Row Shape
Future key rotation is supported without database schema changes by storing the encrypted details as a unified JSON object representing `EncryptedSeedPhrase`:
```typescript
interface EncryptedSeedPhrase {
  ciphertext: string;
  iv: string;
  authTag: string;
  keyVersion: string;
  algorithm: "aes-256-gcm";
}
```
This can be saved directly in a text or JSON/JSONB column. The `keyVersion` metadata determines which key version (e.g., `v1`, `v2`) was used for encryption, enabling seamless background rotation of legacy rows during decrypt-reencrypt operations.

