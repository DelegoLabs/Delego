# @delego/orchestrator

Delego **orchestrator** service.

## Development

```bash
pnpm --filter @delego/orchestrator dev
```

Health check: `GET http://localhost:3010/health`

## Persistence & State Machine

The service uses **XState-style** state machines to manage purchase workflows, persisting the state snapshots to a PostgreSQL database.

### Schema

State is stored in the `purchase_workflows` table:
- `order_id` (PRIMARY KEY)
- `user_id` (UUID references users)
- `state` (VARCHAR)
- `context` (JSONB)
- `version` (INTEGER - used for optimistic concurrency locking)
- `updated_at` (TIMESTAMPTZ)

### Operational Assumptions & Environment Variables

- `DATABASE_URL`: Connection string for the PostgreSQL database. Defaults to `postgresql://delego:delego@localhost:5432/delego`.
- **Startup Recovery**: During orchestrator service startup, the service queries all unfinished workflows (where `state NOT IN ('Completed', 'Refunded')`) and automatically recovers their state contexts to support resumption.
- **Optimistic Concurrency**: Any transition update checks if the workflow's database version matches the expected context version before updating. If a version mismatch is detected, it throws a version conflict error to prevent concurrent overwrites.

