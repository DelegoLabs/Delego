-- Migration: 006_processed_messages
-- Description: Idempotent consumer deduplication for Redis and contract-derived events (Issue #217)

CREATE TABLE IF NOT EXISTS processed_messages (
  message_id VARCHAR(255) PRIMARY KEY,
  consumer VARCHAR(100) NOT NULL,
  processed_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_processed_messages_consumer
  ON processed_messages(consumer);

-- Down migration (manual rollback)
-- DROP INDEX IF EXISTS idx_processed_messages_consumer;
-- DROP TABLE IF EXISTS processed_messages;
