-- Migration: 012_payment_records_dispute
-- Description: Track dispute transactions on payment_records so the escrow
-- coordinator can emit a payment:disputed event when an escrow enters the
-- Disputed state on-chain.

ALTER TABLE payment_records
  ADD COLUMN IF NOT EXISTS dispute_tx_hash VARCHAR(64);

-- Down migration (manual rollback)
-- ALTER TABLE payment_records DROP COLUMN IF EXISTS dispute_tx_hash;
