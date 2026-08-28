-- Migration: 005_escrow_fee_configs.sql
-- Description: Platform fee configuration per token, used to render the gross/fee/net
-- breakdown on escrow detail and receipt views. A row with is_dynamic = true has no
-- guaranteed fee_basis_points — the UI shows an "Estimated" badge and omits fee/net
-- amounts rather than fabricating a number.

-- Up migration

CREATE TABLE IF NOT EXISTS escrow_fee_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token VARCHAR(64) NOT NULL UNIQUE,
    fee_basis_points INTEGER CHECK (fee_basis_points IS NULL OR (fee_basis_points >= 0 AND fee_basis_points <= 10000)),
    is_dynamic BOOLEAN NOT NULL DEFAULT false,
    treasuries JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (is_dynamic = true OR fee_basis_points IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_escrow_fee_configs_token ON escrow_fee_configs(token);

-- Down migration
-- (Would drop escrow_fee_configs, but not run automatically)
