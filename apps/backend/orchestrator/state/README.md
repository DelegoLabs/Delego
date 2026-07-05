# Orchestrator State

Workflow state persistence and recovery.

- PostgreSQL for durable workflow records
- Redis for active session cache (`src/pubsub/` — publish wrapper with retries)
- Saga pattern for distributed transactions

<!-- TODO: Implement state store interface -->
