-- Migration: 010_escrow_funding_locks
-- Description: Escrow funding lock tracking table for double-funding prevention defense in depth

CREATE TABLE IF NOT EXISTS escrow_funding_locks (
  order_id UUID PRIMARY KEY,
  lock_token VARCHAR(64) NOT NULL,
  ttl_ms INT NOT NULL DEFAULT 30000,
  acquired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_escrow_funding_locks_order_id
  ON escrow_funding_locks(order_id);

-- Down migration (manual rollback)
-- DROP INDEX IF EXISTS idx_escrow_funding_locks_order_id;
-- DROP TABLE IF EXISTS escrow_funding_locks;
