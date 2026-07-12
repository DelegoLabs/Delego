-- Migration: 005_service_event_outbox
-- Description: Transactional outbox for reliable Redis / service event publishing (Issue #216)

CREATE TABLE IF NOT EXISTS service_event_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic VARCHAR(255) NOT NULL,
  payload JSONB NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_service_event_outbox_status_created_at
  ON service_event_outbox(status, created_at);

-- Down migration (manual rollback)
-- DROP INDEX IF EXISTS idx_service_event_outbox_status_created_at;
-- DROP TABLE IF EXISTS service_event_outbox;
