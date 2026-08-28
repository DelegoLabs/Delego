-- Migration: 004_order_issues_and_disputes.sql
-- Description: Lightweight pre-dispute "report a problem" flow (order_issues),
-- kept as a table fully separate from the formal dispute flow (disputes).
-- An order_issue may be escalated into a disputes row via disputes.issue_id,
-- but the two tables never share a status column or enum.

-- Up migration

CREATE TABLE IF NOT EXISTS order_issues (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    reporter_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category VARCHAR(32) NOT NULL CHECK (category IN ('late', 'damaged', 'not_received', 'other')),
    message TEXT,
    photo_url TEXT,
    status VARCHAR(32) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'resolved', 'escalated')),
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_issues_order_id ON order_issues(order_id);
CREATE INDEX IF NOT EXISTS idx_order_issues_reporter_user_id ON order_issues(reporter_user_id);

CREATE TABLE IF NOT EXISTS disputes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    issue_id UUID REFERENCES order_issues(id) ON DELETE SET NULL,
    category VARCHAR(32) NOT NULL CHECK (category IN ('late', 'damaged', 'not_received', 'other')),
    message TEXT NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'under_review', 'resolved', 'closed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_disputes_order_id ON disputes(order_id);
CREATE INDEX IF NOT EXISTS idx_disputes_issue_id ON disputes(issue_id);

-- Down migration
-- (Would drop order_issues and disputes, but not run automatically)
