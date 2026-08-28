-- Migration: 006_approvals.sql
-- Description: Pending actions a business user must approve or reject, backing the
-- virtualized approvals list.

-- Up migration

CREATE TABLE IF NOT EXISTS approvals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    amount_stroops BIGINT,
    requested_by VARCHAR(255) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_approvals_user_id ON approvals(user_id);
CREATE INDEX IF NOT EXISTS idx_approvals_status ON approvals(status);

-- Down migration
-- (Would drop approvals, but not run automatically)
