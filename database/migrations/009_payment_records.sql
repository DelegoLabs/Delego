-- Migration: 009_payment_records
-- Description: Payment records for escrow coordinator fund/release/refund tracking

CREATE TABLE IF NOT EXISTS payment_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id),
  escrow_id VARCHAR(64),
  escrow_contract_id VARCHAR(56) NOT NULL,
  buyer_address VARCHAR(56) NOT NULL,
  seller_address VARCHAR(56) NOT NULL,
  token_contract_id VARCHAR(56) NOT NULL,
  amount_stroops BIGINT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  fund_tx_hash VARCHAR(64),
  release_tx_hash VARCHAR(64),
  refund_tx_hash VARCHAR(64),
  failure_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_records_order_id
  ON payment_records(order_id);

CREATE INDEX IF NOT EXISTS idx_payment_records_escrow_id
  ON payment_records(escrow_id)
  WHERE escrow_id IS NOT NULL;

-- Down migration (manual rollback)
-- DROP INDEX IF EXISTS idx_payment_records_escrow_id;
-- DROP INDEX IF EXISTS idx_payment_records_order_id;
-- DROP TABLE IF EXISTS payment_records;
