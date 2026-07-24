-- Purchase workflows state persistence for XState recovery (Issue #54)

CREATE TABLE IF NOT EXISTS purchase_workflows (
  order_id VARCHAR(255) PRIMARY KEY,
  user_id UUID NOT NULL,
  state VARCHAR(100) NOT NULL,
  context JSONB NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_purchase_workflows_user_id ON purchase_workflows(user_id);
CREATE INDEX IF NOT EXISTS idx_purchase_workflows_state ON purchase_workflows(state);
