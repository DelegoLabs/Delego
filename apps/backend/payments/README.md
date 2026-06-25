# @delego/payments

Delego **payments** service — coordinates escrow contract interactions on the Stellar/Soroban network.

## Development

```bash
pnpm --filter @delego/payments dev
```

Health check: `GET http://localhost:3014/health`

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PAYMENTS_PORT` | `3014` | HTTP port the service listens on |
| `WALLET_URL` | `http://localhost:3012` | Base URL of the wallet service used to submit contract calls |
| `ESCROW_CONTRACT_ID` | _(required)_ | Soroban contract address of the deployed escrow contract |
| `REDIS_URL` | — | Redis connection URL (e.g. `redis://localhost:6379`). Takes priority over `REDIS_HOST`/`REDIS_PORT` |
| `REDIS_HOST` | `localhost` | Redis host (used when `REDIS_URL` is not set) |
| `REDIS_PORT` | `6379` | Redis port (used when `REDIS_URL` is not set) |
| `ESCROW_FUNDING_LOCK_TTL_MS` | `30000` | TTL in milliseconds for the distributed escrow funding lock. The lock auto-expires if the process crashes before releasing it. |
| `LOG_LEVEL` | `info` | Logging verbosity (`debug`, `info`, `warn`, `error`) |

## Escrow Funding Lock

Concurrent deposit requests for the **same `orderId`** are prevented with a Redis
distributed lock (`SET NX PX`). A Lua script ensures the lock can only be released
by the holder (token ownership check).

- **Conflict (409)**: A second deposit request for the same order while one is already
  in flight returns `{ error: { code: "ESCROW_FUNDING_CONFLICT" } }`.
- **Lock unavailable (503)**: If Redis is unreachable when acquiring the lock the service
  returns `{ error: { code: "LOCK_SERVICE_UNAVAILABLE" } }`. The client should retry.
- **Auto-expiry**: The lock has a configurable TTL (`ESCROW_FUNDING_LOCK_TTL_MS`) so a
  crash or a missed release cannot permanently block an order.
- **Defense in depth**: The Soroban escrow contract enforces on-chain uniqueness as an
  additional guard independent of the application-layer lock.

## API Routes

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/escrow/initialize` | Initialize the escrow contract on-chain |
| `POST` | `/escrow/deposit` | Fund an escrow (requires `Idempotency-Key` header; locks by `orderId` when provided) |
| `POST` | `/escrow/:escrowId/release` | Release escrowed funds to the seller (requires `Idempotency-Key`) |
| `POST` | `/escrow/:escrowId/refund` | Refund escrowed funds to the buyer (requires `Idempotency-Key`) |
