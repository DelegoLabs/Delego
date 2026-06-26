-- Migration: 004_soroban_transaction_ledger.sql
-- Description: Create soroban_transaction_ledger table

-- Up migration
CREATE TABLE IF NOT EXISTS soroban_transaction_ledger (
  hash VARCHAR(64) PRIMARY KEY,
  order_id VARCHAR(255),
  contract_id VARCHAR(255),
  method VARCHAR(100) NOT NULL,
  status VARCHAR(20) NOT NULL CHECK (status IN ('PENDING', 'CONFIRMED', 'FAILED')),
  error_details TEXT,
  submitted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  confirmed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_soroban_tx_ledger_status ON soroban_transaction_ledger(status);
CREATE INDEX IF NOT EXISTS idx_soroban_tx_ledger_order_id ON soroban_transaction_ledger(order_id);

-- Down migration
DROP INDEX IF EXISTS idx_soroban_tx_ledger_order_id;
DROP INDEX IF EXISTS idx_soroban_tx_ledger_status;
DROP TABLE IF EXISTS soroban_transaction_ledger;
