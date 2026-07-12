-- Migration: 007_signing_key_versions
-- Description: Track signing key version metadata for encrypted wallet seeds (Issue #198)

CREATE TABLE IF NOT EXISTS signing_key_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id UUID NOT NULL,
  key_version VARCHAR(50) NOT NULL,
  active_from TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  rotated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_signing_key_versions_wallet_id
  ON signing_key_versions(wallet_id);

CREATE INDEX IF NOT EXISTS idx_signing_key_versions_active
  ON signing_key_versions(wallet_id, active_from DESC);

-- Down migration (manual rollback)
-- DROP INDEX IF EXISTS idx_signing_key_versions_active;
-- DROP INDEX IF EXISTS idx_signing_key_versions_wallet_id;
-- DROP TABLE IF EXISTS signing_key_versions;
