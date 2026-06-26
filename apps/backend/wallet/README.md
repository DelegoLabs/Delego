# @delego/wallet

Delego **wallet** service.

## Development

```bash
pnpm --filter @delego/wallet dev
```

Health check: `GET http://localhost:3012/health`

## Sequence Number Reservation System

To prevent sequence number conflicts during parallel transaction submission, we've implemented a pre-allocation block reservation system in Redis.

### Key Features

- **Non-overlapping sequence blocks**: Uses Redis locks to ensure concurrent workers get unique blocks
- **Expired reservation cleanup**: Automatically cleans up expired/invalid reservations
- **Backward compatible**: Falls back to the original cache mechanism if no reservations exist
- **Idempotent retries**: Safe for retries and multiple workers

### Redis Keys Used

- `seq:reservations:{account}`: List of active reservations for an account
- `seq:lock:{account}`: Lock used when creating new reservations
- `seq:res:{leaseId}:cursor`: Tracks progress within a reservation block
- `seq:{account}`: Legacy cache key for backward compatibility

### API

```typescript
import { reserveSequenceBlock } from "./src/queue/txQueue";

// Reserve a block of 10 sequence numbers
const reservation = await reserveSequenceBlock(
  "GDEMOACCOUNT...",  // Account address
  10,                 // Block size
  redisClient,        // Redis connection
  horizonServer       // Horizon server
);
```

### Configuration

No additional environment variables are required. Uses existing Redis configuration.

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

