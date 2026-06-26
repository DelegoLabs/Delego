-- Migration: 005_purchase_workflows.sql
-- Description: Create purchase_workflows table for XState persistence

-- Up migration
CREATE TABLE IF NOT EXISTS purchase_workflows (
  order_id VARCHAR(255) PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  state VARCHAR(100) NOT NULL,
  context JSONB NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_purchase_workflows_user_id ON purchase_workflows(user_id);

-- Down migration
DROP INDEX IF EXISTS idx_purchase_workflows_user_id;
DROP TABLE IF EXISTS purchase_workflows;
