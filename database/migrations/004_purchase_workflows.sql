-- Add a durable purchase workflow persistence table for orchestrator state recovery

CREATE TABLE IF NOT EXISTS purchase_workflows (
    order_id VARCHAR(255) PRIMARY KEY,
    user_id UUID NOT NULL,
    state VARCHAR(100) NOT NULL,
    context JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_purchase_workflows_user_id ON purchase_workflows(user_id);
