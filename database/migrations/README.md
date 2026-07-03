# Database Migrations

Versioned SQL migrations applied in order.

Naming convention: `NNN_description.sql`

| Migration | Description |
|-----------|-------------|
| `005_service_event_outbox.sql` | Transactional outbox for reliable Redis event publishing (Issue #216) |
| `006_processed_messages.sql` | Idempotent consumer deduplication table (Issue #217) |
