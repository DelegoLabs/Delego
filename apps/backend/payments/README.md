# @delego/payments

Delego **payments** service.

### Escrow Funding Lock & Double-Funding Prevention

Protects checkout workflows against race conditions and concurrent deposit attempts on the same order.

- **Atomic Redis Locks**: Uses atomic `SET key lockToken PX ttlMs NX` locks (`escrow:lock:funding:<orderId>`) to prevent duplicate in-flight funding operations.
- **Scripted Release**: Executes an atomic Lua script (`RELEASE_LOCK_LUA`) to ensure lock deletion is only performed by the acquiring lock token.
- **Defense in Depth**: Backed by database unique constraints on `payment_records(order_id)` and `escrow_funding_locks(order_id)` (`010_escrow_funding_locks.sql`).
- **Conflict Responses**: Rejects duplicate concurrent requests with an HTTP `409 Conflict` envelope (`DUPLICATE_FUNDING_REQUEST`) without queuing duplicate blockchain transactions.

See `validation.ts` (`acquireLock`, `releaseLock`) for technical specifications.

## Development

```bash
pnpm --filter @delego/payments dev
```

Health check: `GET http://localhost:3014/health`

Escrow coordinator health probe: `GET http://localhost:3014/escrow/health`

Returns dependency readiness for escrow funding and settlement:

```json
{
  "data": {
    "database": "ok",
    "walletService": "ok",
    "sorobanRpc": "ok",
    "checkedAt": "2026-06-30T12:00:00.000Z"
  },
  "error": null
}
```

Each dependency reports `"ok"` or `"degraded"`. An unavailable Soroban RPC returns `"degraded"` without failing the endpoint.

## Testing

```bash
# Run tests once
pnpm --filter @delego/payments test

# Watch mode
pnpm --filter @delego/payments test:watch
```

## Environment Configuration

```bash
# Network selection (default: testnet)
STELLAR_NETWORK=testnet|mainnet|futurenet

# Horizon endpoint (optional, uses intelligent defaults)
STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org

# Wallet service endpoint
WALLET_URL=http://localhost:3012

# PostgreSQL (processed contract events / payment records / funding locks)
DATABASE_URL=postgresql://delego:delego@localhost:5432/delego

# Redis URL for streaming events and funding locks
REDIS_URL=redis://localhost:6379

# Escrow Funding Lock TTL in milliseconds (default: 30000)
ESCROW_LOCK_TTL_MS=30000

# Soroban RPC (escrow contract reads; optional, network-aware default)
SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
```

## Architecture

- **escrow/**: Escrow contract interactions and fee management
  - `feeEstimator.ts`: Dynamic fee fetching from Horizon
  - `wallet-client.ts`: Wallet service integration
  - `FEE_ESTIMATION.md`: Comprehensive fee estimation guide
- **events/**: Event-driven payment workflows
- **settlement/**: Settlement and reconciliation logic
- **src/**: Core payment service logic and HTTP route handlers
  - `validation.ts`: Escrow funding lock definitions (`acquireLock`, `releaseLock`, `EscrowFundingLock`) and payload validators
  - `routes.ts`: Payment routes with 409 `DUPLICATE_FUNDING_REQUEST` concurrency protections

