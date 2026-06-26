# @delego/payments

Delego **payments** service.

## Development

```bash
pnpm --filter @delego/payments dev
```

Health check: `GET http://localhost:3014/health`

## Database-Backed Transaction Ledger

To sync off-chain transaction status and maintain idempotency, the payments service tracks transaction confirmation state via the `soroban_transaction_ledger` table.

### Schema Details

The ledger persists transaction data with the following fields:
- `hash` (`VARCHAR(64)`): Primary key (Stellar transaction hash).
- `order_id` (`VARCHAR(255)`): Links transaction back to a payment/order workflow.
- `contract_id` (`VARCHAR(255)`): Soroban contract address.
- `method` (`VARCHAR(100)`): Called smart contract method (e.g. `initialize`, `create_escrow`).
- `status` (`VARCHAR(20)`): State of confirmation (`PENDING`, `CONFIRMED`, `FAILED`).
- `error_details` (`TEXT`): Failure reason, if applicable.
- `submitted_at`, `confirmed_at`, `created_at`, `updated_at`: Timestamps.

### Configuration / Environment Variables

Ensure the following environment variables are set in the service environment:
- `DATABASE_URL`: Connection string for PostgreSQL database.
- `DATABASE_POOL_MIN`: Minimum DB connection pool size (default: `2`).
- `DATABASE_POOL_MAX`: Maximum DB connection pool size (default: `10`).
- `LOG_LEVEL`: Logging verbosity level.
