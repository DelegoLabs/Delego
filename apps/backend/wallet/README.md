# @delego/wallet

Delego **wallet** service.

## Development

```bash
pnpm --filter @delego/wallet dev
```

Health check: `GET http://localhost:3012/health`

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

