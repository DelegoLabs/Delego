# @delego/orchestrator

Delego **orchestrator** service.

## Development

```bash
pnpm --filter @delego/orchestrator dev
```

Health check: `GET http://localhost:3010/health`

## Saga coordinator

`src/saga/` implements a generic saga coordinator pattern for reverting previously
executed steps across services when a downstream step fails:

- `SagaCoordinator` runs an ordered list of `SagaStep`s (`action` + `compensation`)
  against a `SagaStore`. On failure it transitions the saga to `compensating` and runs
  the compensation for each completed step in reverse order.
- `PostgresSagaStore` persists every step transition to the `saga_executions` table
  (added in `database/schema/002_orchestrator_sagas.sql`) so progress survives an
  orchestrator crash. `SagaCoordinator.recoverAll()` is called on startup to resume any
  saga left `running` or `compensating`.
- `SagaCoordinator.run()` is idempotent for an already-started `sagaId` — it resumes
  from persisted state instead of restarting, and `resume()` skips steps already marked
  complete. Compensation steps must themselves be idempotent, since a crash can interrupt
  compensation after a downstream side effect has already been applied but before the
  saga record is updated.
- `workflows/checkout/index.ts` wires this into checkout: `deposit-escrow` calls the
  payments service's `POST /escrow/deposit` and compensates via `POST
  /escrow/:escrowId/refund` if a later step fails. `confirm-checkout` is currently a
  context-only transition — it should call a gateway order-status endpoint once one
  exists.

### Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | `postgresql://delego:delego@localhost:5432/delego` | Postgres connection for `saga_executions` |
| `DATABASE_POOL_MIN` / `DATABASE_POOL_MAX` | `2` / `10` | Sequelize pool sizing |
| `PAYMENTS_URL` | `http://localhost:3014` | Payments service base URL used by the checkout saga's escrow steps |

### HTTP endpoints

- `POST /checkout` — `{ orderId, sourceAddress, buyerAddress, sellerAddress }`, runs the
  checkout saga to completion (or compensation) and returns its final status.
- `GET /sagas/:sagaId` — current saga status and completed steps.
- `POST /sagas/:sagaId/resume` — manually resume a saga stuck in `running` or
  `compensating` (e.g. after a downstream outage is fixed).
