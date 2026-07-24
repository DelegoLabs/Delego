-- Migration: 010_workflow_events
-- Description: Event sourcing for workflow state transitions (Issue #354)
-- Stores every workflow event with full metadata for replay and audit.

CREATE TABLE IF NOT EXISTS workflow_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id VARCHAR(255) NOT NULL,
  event_type VARCHAR(100) NOT NULL,
  payload JSONB NOT NULL,
  from_state VARCHAR(100),
  to_state VARCHAR(100) NOT NULL,
  metadata JSONB DEFAULT '{}',
  recorded_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_workflow_events_workflow_id
  ON workflow_events(workflow_id);

CREATE INDEX IF NOT EXISTS idx_workflow_events_recorded_at
  ON workflow_events(recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_workflow_events_event_type
  ON workflow_events(event_type);

-- Down migration (manual rollback)
-- DROP INDEX IF EXISTS idx_workflow_events_event_type;
-- DROP INDEX IF EXISTS idx_workflow_events_recorded_at;
-- DROP INDEX IF EXISTS idx_workflow_events_workflow_id;
-- DROP TABLE IF EXISTS workflow_events;
