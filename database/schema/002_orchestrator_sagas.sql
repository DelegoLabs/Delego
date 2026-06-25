-- Orchestrator saga coordinator — durable saga progress for crash recovery

CREATE TABLE IF NOT EXISTS saga_executions (
    saga_id VARCHAR(128) PRIMARY KEY,
    order_id VARCHAR(128) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'running',
    completed_steps JSONB NOT NULL DEFAULT '[]',
    context JSONB NOT NULL DEFAULT '{}',
    current_step VARCHAR(128),
    error TEXT,
    version INTEGER NOT NULL DEFAULT 0,
    claim_expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_saga_executions_order_id ON saga_executions(order_id);
CREATE INDEX IF NOT EXISTS idx_saga_executions_status ON saga_executions(status);
