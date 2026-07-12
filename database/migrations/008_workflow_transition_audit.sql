-- Migration: 008_workflow_transition_audit
-- Description: Persist lightweight audit records for workflow transitions (Issue #206)

CREATE TABLE IF NOT EXISTS workflow_transition_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id VARCHAR(255) NOT NULL,
  from_state VARCHAR(100),
  to_state VARCHAR(100) NOT NULL,
  event_type VARCHAR(100) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_workflow_transition_audit_order_id
  ON workflow_transition_audit(order_id);

CREATE INDEX IF NOT EXISTS idx_workflow_transition_audit_created_at
  ON workflow_transition_audit(created_at DESC);

-- Down migration (manual rollback)
-- DROP INDEX IF EXISTS idx_workflow_transition_audit_created_at;
-- DROP INDEX IF EXISTS idx_workflow_transition_audit_order_id;
-- DROP TABLE IF EXISTS workflow_transition_audit;
