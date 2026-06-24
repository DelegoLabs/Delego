-- Migration: 004_oauth_accounts.sql
-- Description: Add oauth_accounts table to support OAuth2/OpenID provider identity linking.
--              Allows one user to have multiple social provider accounts linked.
--              Also adds display_name column to users if not already present.

-- Up migration

-- Add display_name to users if it was not added in a prior migration
ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name VARCHAR(255);

-- Add avatar_url to users for OAuth profile photos
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- OAuth account links: one user may be linked to multiple providers
CREATE TABLE IF NOT EXISTS oauth_accounts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider        VARCHAR(32)  NOT NULL,              -- 'google' | 'github'
  provider_user_id VARCHAR(255) NOT NULL,             -- provider's stable user ID
  email           VARCHAR(255),                       -- email as reported by provider
  display_name    VARCHAR(255),                       -- display name from provider
  avatar_url      TEXT,                               -- avatar URL from provider
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  -- Each (provider, provider_user_id) pair is globally unique
  CONSTRAINT oauth_accounts_provider_uid UNIQUE (provider, provider_user_id)
);

CREATE INDEX IF NOT EXISTS idx_oauth_accounts_user_id ON oauth_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_oauth_accounts_provider ON oauth_accounts(provider);
-- Allows fast lookup for "does this google user ID already exist?"
CREATE INDEX IF NOT EXISTS idx_oauth_accounts_provider_uid ON oauth_accounts(provider, provider_user_id);

-- Down migration (run manually — never applied automatically)
-- DROP INDEX IF EXISTS idx_oauth_accounts_provider_uid;
-- DROP INDEX IF EXISTS idx_oauth_accounts_provider;
-- DROP INDEX IF EXISTS idx_oauth_accounts_user_id;
-- DROP TABLE IF EXISTS oauth_accounts;
-- ALTER TABLE users DROP COLUMN IF EXISTS avatar_url;
-- ALTER TABLE users DROP COLUMN IF EXISTS display_name;
