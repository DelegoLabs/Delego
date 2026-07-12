-- Migration: 004_processed_contract_events
-- Description: Persist processed escrow contract events for deduplication

CREATE TABLE IF NOT EXISTS processed_contract_events (
  event_id VARCHAR(255) PRIMARY KEY,
  contract_id VARCHAR(255) NOT NULL,
  processed_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_processed_contract_events_contract_id
  ON processed_contract_events(contract_id);

-- Down migration (manual rollback)
-- DROP INDEX IF EXISTS idx_processed_contract_events_contract_id;
-- DROP TABLE IF EXISTS processed_contract_events;
