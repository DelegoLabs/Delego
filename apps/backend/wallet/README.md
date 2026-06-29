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

## HSM Key Signer Adapter

Transaction building and signing are separated behind a `KeySigner` interface in `src/vault.ts`. The adapter never exposes raw private keys from provider implementations — callers pass opaque `keyId` values and receive signatures or public keys only.

| Export | Purpose |
|---|---|
| `KeySigner` | `sign(data, keyId)` and `getPublicKey(keyId)` contract |
| `KeySignerProvider` | `{ provider, keyId }` configuration |
| `createKeySigner(provider?)` | Factory for `local`, `aws-kms`, or `hashicorp-vault` drivers |
| `getKeySigner()` / `setKeySigner()` | Process-wide signer singleton (override in tests) |
| `KeySignerError` | Stable `code` plus `retryable` flag for transient HSM outages |

### Providers

| Provider | Use case | `keyId` meaning |
|---|---|---|
| `local` | Development | Stellar public address (`G...`) stored in the encrypted file vault |
| `aws-kms` | Production | AWS KMS key id, ARN, or alias (ED25519 key spec) |
| `hashicorp-vault` | Production | Transit engine key name |

`sign()` is stateless and idempotent for identical inputs, so BullMQ retries and blockchain resubmission paths can safely re-invoke signing.

### Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `WALLET_KEY_SIGNER_PROVIDER` | `local` | `local`, `aws-kms`, or `hashicorp-vault` |
| `WALLET_KEY_SIGNER_KEY_ID` | _(empty)_ | Default key id when callers omit `keyId` |
| `AWS_REGION` | `us-east-1` | AWS region for the KMS client |
| `VAULT_ADDR` | _(required for Vault)_ | HashiCorp Vault base URL |
| `VAULT_TOKEN` | _(required for Vault)_ | Vault token with transit sign/read access |
| `VAULT_TRANSIT_MOUNT` | `transit` | Transit secrets engine mount path |

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

