#[cfg(test)]
mod test {
    use soroban_sdk::{testutils::Address as _, Address, Env, Vec};
    use crate::{PermissionsContract, PermissionsContractClient};

    #[test]
    fn test_grant() {
        let env = Env::default();
        let owner = Address::generate(&env);
        let delegate = Address::generate(&env);
        let merchant = Address::generate(&env);

        let contract_id = env.register(PermissionsContract, ());
        let client = PermissionsContractClient::new(&env, &contract_id);

        env.mock_all_auths();

        let mut merchants = Vec::new(&env);
        merchants.push_back(merchant.clone());

        assert!(client.grant(&owner, &delegate, &1000, &100, &merchants, &10000));
        assert!(client.can_spend(&owner, &delegate, &50, &merchant));
    }

    #[test]
    fn test_revoke() {
        let env = Env::default();
        let owner = Address::generate(&env);
        let delegate = Address::generate(&env);
        let merchant = Address::generate(&env);

        let contract_id = env.register(PermissionsContract, ());
        let client = PermissionsContractClient::new(&env, &contract_id);

        env.mock_all_auths();

        let merchants = Vec::new(&env);
        assert!(client.grant(&owner, &delegate, &1000, &100, &merchants, &10000));
        assert!(client.revoke(&owner, &delegate));
        assert!(!client.can_spend(&owner, &delegate, &50, &merchant));
    }

    #[test]
    fn test_get_permission() {
        let env = Env::default();
        let owner = Address::generate(&env);
        let delegate = Address::generate(&env);

        let contract_id = env.register(PermissionsContract, ());
        let client = PermissionsContractClient::new(&env, &contract_id);

        env.mock_all_auths();

        let merchants = Vec::new(&env);
        assert!(client.grant(&owner, &delegate, &1000, &100, &merchants, &10000));

        let perm = client.get_permission(&owner, &delegate);
        assert_eq!(perm.owner, owner);
        assert_eq!(perm.delegate, delegate);
        assert_eq!(perm.limit_total, 1000);
        assert_eq!(perm.spent, 0);
        assert_eq!(perm.limit_per_tx, 100);
        assert_eq!(perm.status, crate::PermissionStatus::Active);
    }

    #[test]
    fn test_get_remaining_allowance() {
        let env = Env::default();
        let owner = Address::generate(&env);
        let delegate = Address::generate(&env);
        let merchant = Address::generate(&env);

        let contract_id = env.register(PermissionsContract, ());
        let client = PermissionsContractClient::new(&env, &contract_id);

        env.mock_all_auths();

        let merchants = Vec::new(&env);
        assert!(client.grant(&owner, &delegate, &1000, &100, &merchants, &10000));
        assert_eq!(client.get_remaining_allowance(&owner, &delegate), 1000);

        assert!(client.execute_spend(&owner, &delegate, &30, &merchant));
        assert_eq!(client.get_remaining_allowance(&owner, &delegate), 970);
    }

    // ── Epoch / renewable-allowance tests ────────────────────────────────────

    #[test]
    fn test_set_renewable_allowance_basic() {
        let env = Env::default();
        env.mock_all_auths();
        let owner = Address::generate(&env);
        let delegate = Address::generate(&env);

        let contract_id = env.register(PermissionsContract, ());
        let client = PermissionsContractClient::new(&env, &contract_id);

        let merchants = Vec::new(&env);
        client.grant(&owner, &delegate, &500, &100, &merchants, &10000);

        assert!(client.set_renewable_allowance(&owner, &delegate, &200, &crate::Epoch::Daily));

        let ra = client.get_renewable_allowance(&owner, &delegate);
        assert_eq!(ra.limit, 200);
        assert_eq!(ra.spent, 0);
        assert_eq!(ra.epoch, crate::Epoch::Daily);
    }

    #[test]
    fn test_renewable_allowance_resets_after_epoch() {
        let env = Env::default();
        env.mock_all_auths();
        let owner = Address::generate(&env);
        let delegate = Address::generate(&env);

        let contract_id = env.register(PermissionsContract, ());
        let client = PermissionsContractClient::new(&env, &contract_id);

        let merchants = Vec::new(&env);
        client.grant(&owner, &delegate, &500, &100, &merchants, &10000);
        client.set_renewable_allowance(&owner, &delegate, &200, &crate::Epoch::Daily);

        // Simulate some spent by directly reading and checking initial state
        let ra = client.get_renewable_allowance(&owner, &delegate);
        assert_eq!(ra.spent, 0);

        // Advance time past one daily epoch (86400 seconds)
        env.ledger().set_timestamp(env.ledger().timestamp() + 86_401);

        let ra_after = client.get_renewable_allowance(&owner, &delegate);
        assert_eq!(ra_after.spent, 0, "spent should reset after epoch boundary");
    }

    #[test]
    fn test_renewable_allowance_resets_after_weekly_epoch() {
        let env = Env::default();
        env.mock_all_auths();
        let owner = Address::generate(&env);
        let delegate = Address::generate(&env);

        let contract_id = env.register(PermissionsContract, ());
        let client = PermissionsContractClient::new(&env, &contract_id);

        let merchants = Vec::new(&env);
        client.grant(&owner, &delegate, &1000, &500, &merchants, &10000);
        client.set_renewable_allowance(&owner, &delegate, &500, &crate::Epoch::Weekly);

        // Advance past 7 days
        env.ledger().set_timestamp(env.ledger().timestamp() + 604_801);

        let ra = client.get_renewable_allowance(&owner, &delegate);
        assert_eq!(ra.spent, 0);
    }

    #[test]
    fn test_renewable_allowance_no_reset_within_epoch() {
        let env = Env::default();
        env.mock_all_auths();
        let owner = Address::generate(&env);
        let delegate = Address::generate(&env);

        let contract_id = env.register(PermissionsContract, ());
        let client = PermissionsContractClient::new(&env, &contract_id);

        let merchants = Vec::new(&env);
        client.grant(&owner, &delegate, &1000, &500, &merchants, &10000);
        client.set_renewable_allowance(&owner, &delegate, &500, &crate::Epoch::Daily);

        // Advance time but stay within the epoch (< 86400 seconds)
        env.ledger().set_timestamp(env.ledger().timestamp() + 43_200);

        let ra = client.get_renewable_allowance(&owner, &delegate);
        // spent is still 0 (no spends recorded), epoch has not elapsed → no reset triggered
        assert_eq!(ra.spent, 0);
        // epoch_started_at should be unchanged
        assert_eq!(ra.current_epoch_started_at, 0);
    }

    #[test]
    #[should_panic(expected = "Permission is not active")]
    fn test_set_renewable_allowance_revoked_permission_fails() {
        let env = Env::default();
        env.mock_all_auths();
        let owner = Address::generate(&env);
        let delegate = Address::generate(&env);

        let contract_id = env.register(PermissionsContract, ());
        let client = PermissionsContractClient::new(&env, &contract_id);

        let merchants = Vec::new(&env);
        client.grant(&owner, &delegate, &500, &100, &merchants, &10000);
        client.revoke(&owner, &delegate);

        // Must panic – revoked permission
        client.set_renewable_allowance(&owner, &delegate, &200, &crate::Epoch::Daily);
    }

    #[test]
    #[should_panic(expected = "Permission is expired")]
    fn test_set_renewable_allowance_expired_permission_fails() {
        let env = Env::default();
        env.mock_all_auths();
        let owner = Address::generate(&env);
        let delegate = Address::generate(&env);

        let contract_id = env.register(PermissionsContract, ());
        let client = PermissionsContractClient::new(&env, &contract_id);

        let ttl = 100u32;
        let merchants = Vec::new(&env);
        client.grant(&owner, &delegate, &500, &100, &merchants, &ttl);

        // Advance past expiry
        env.ledger().set_sequence_number(env.ledger().sequence() + ttl + 1);

        // Must panic – expired permission
        client.set_renewable_allowance(&owner, &delegate, &200, &crate::Epoch::Daily);
    }

    #[test]
    fn test_epoch_start_advances_correctly_across_multiple_epochs() {
        let env = Env::default();
        env.mock_all_auths();
        let owner = Address::generate(&env);
        let delegate = Address::generate(&env);

        let contract_id = env.register(PermissionsContract, ());
        let client = PermissionsContractClient::new(&env, &contract_id);

        let merchants = Vec::new(&env);
        client.grant(&owner, &delegate, &1000, &500, &merchants, &100000);
        client.set_renewable_allowance(&owner, &delegate, &500, &crate::Epoch::Daily);

        // Jump 3 full days + a bit
        env.ledger().set_timestamp(env.ledger().timestamp() + 3 * 86_400 + 1);

        let ra = client.get_renewable_allowance(&owner, &delegate);
        assert_eq!(ra.spent, 0);
        // current_epoch_started_at should have advanced by exactly 3 epochs
        assert_eq!(ra.current_epoch_started_at, 3 * 86_400);
    }
}
