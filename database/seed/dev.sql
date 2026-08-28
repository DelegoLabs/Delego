-- Development seed data for Delego

-- Clear existing data (in reverse dependency order)
TRUNCATE TABLE permission_levels, delegation_policies, spend_limits, disputes, order_issues, approvals, escrow_fee_configs, orders, delegations, wallets, users CASCADE;

-- Insert dev users
-- password123 hashed using bcrypt (cost=10)
INSERT INTO users (id, email, password_hash, stellar_address, display_name) VALUES
('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'dev@delego.dev', '$2a$10$EpR5Q1.6i.P9dFmZ5Zc1u.TzS5R6u1u/QO28.K15i6Z3bLhS8K1d3', 'GATESTUSER1234567890ABCDEF1234567890ABCDEF1234567890ABCD', 'Dev User'),
('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22', 'merchant@delego.dev', '$2a$10$EpR5Q1.6i.P9dFmZ5Zc1u.TzS5R6u1u/QO28.K15i6Z3bLhS8K1d3', 'GATESTMERCHANT1234567890ABCDEF1234567890ABCDEF1234567890', 'Dev Merchant');

-- Insert dev wallets
INSERT INTO wallets (id, user_id, stellar_address, public_key, encrypted_private_key, network) VALUES
('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'GATESTUSER1234567890ABCDEF1234567890ABCDEF1234567890ABCD', 'GATESTUSER1234567890ABCDEF1234567890ABCDEF1234567890ABCD', 'encrypted_private_key_placeholder', 'testnet');

-- Insert dev delegations
INSERT INTO delegations (id, user_id, agent_id, status, policy) VALUES
('c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'agent_dev_buyer_1', 'active', '{"max_amount": 10000000}');

-- Insert spend limits
INSERT INTO spend_limits (id, user_id, wallet_id, delegation_id, limit_per_transaction, limit_daily, limit_weekly, limit_lifetime) VALUES
('d0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 1000000, 5000000, 25000000, 100000000);

-- Insert delegation policies
INSERT INTO delegation_policies (id, delegation_id, restricted_merchants, restricted_categories, allowed_merchants, allowed_categories) VALUES
('e0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', ARRAY['GRESTRICTEDMERCHANT12345'], ARRAY['gambling', 'entertainment'], ARRAY['GALLOWMERCHANT12345'], ARRAY['utilities', 'retail']);

-- Insert permission levels
INSERT INTO permission_levels (id, delegation_id, level, description, can_sign, can_mutate_policy) VALUES
('f0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'AUTO_APPROVE', 'Automatic approval for low-risk micro-payments', true, false);

-- Insert a dev order
INSERT INTO orders (id, user_id, delegation_id, merchant_id, status, line_items, total_stroops, escrow_contract_id) VALUES
('10eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'GALLOWMERCHANT12345', 'fulfilled', '[{"productId":"prod_1","quantity":1,"unitPriceStroops":10000000}]', 10000000, null);

-- Insert a dev order issue, aged past the "Report a problem" escalate-to-dispute threshold
INSERT INTO order_issues (id, order_id, reporter_user_id, category, message, photo_url, status, created_at) VALUES
('20eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', '10eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'not_received', 'Tracking shows delivered but nothing arrived.', null, 'open', NOW() - INTERVAL '5 days');

-- Insert an escrow fee config for the demo token: a static 2.5% fee split across two treasuries
INSERT INTO escrow_fee_configs (id, token, fee_basis_points, is_dynamic, treasuries) VALUES
('30eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'CDEMOTOKEN1234567890ABCDEF1234567890ABCDEF1234567890ABCD', 250, false,
  '[{"name":"Platform treasury","address":"GPLATFORMTREASURY1234567890ABCDEF1234567890ABCD","splitBasisPoints":8000},{"name":"Referral pool","address":"GREFERRALPOOL1234567890ABCDEF1234567890ABCDEF","splitBasisPoints":2000}]');

-- Insert dev approvals, enough to exercise the virtualized approvals list
INSERT INTO approvals (id, user_id, title, description, amount_stroops, requested_by, status)
SELECT gen_random_uuid(), 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'Approve purchase #' || n, 'Auto-generated demo approval', (n * 100000)::bigint, 'agent_dev_buyer_1', 'pending'
FROM generate_series(1, 40) AS n;
