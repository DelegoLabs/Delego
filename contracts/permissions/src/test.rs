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

    #[test]
    fn test_update_expiry() {
        let env = Env::default();
        let owner = Address::generate(&env);
        let delegate = Address::generate(&env);

        let contract_id = env.register(PermissionsContract, ());
        let client = PermissionsContractClient::new(&env, &contract_id);

        env.mock_all_auths();

        let merchants = Vec::new(&env);
        let initial_ttl = 1000u32;
        assert!(client.grant(&owner, &delegate, &1000, &100, &merchants, &initial_ttl));

        let initial_perm = client.get_permission(&owner, &delegate);
        let initial_expiry = initial_perm.expires_at_ledger;

        // Update expiry with new TTL
        let new_ttl = 2000u32;
        assert!(client.update_expiry(&owner, &delegate, &new_ttl));

        let updated_perm = client.get_permission(&owner, &delegate);
        let current_ledger = env.ledger().sequence();
        let expected_new_expiry = current_ledger + new_ttl;

        assert_eq!(updated_perm.expires_at_ledger, expected_new_expiry);
        assert!(updated_perm.expires_at_ledger > initial_expiry);
    }

    #[test]
    #[should_panic(expected = "New expiry must be in the future")]
    fn test_update_expiry_in_past() {
        let env = Env::default();
        let owner = Address::generate(&env);
        let delegate = Address::generate(&env);

        let contract_id = env.register(PermissionsContract, ());
        let client = PermissionsContractClient::new(&env, &contract_id);

        env.mock_all_auths();

        let merchants = Vec::new(&env);
        assert!(client.grant(&owner, &delegate, &1000, &100, &merchants, &10000));

        // Try to update with TTL that puts expiry in the past (0 TTL)
        client.update_expiry(&owner, &delegate, &0);
    }

    #[test]
    #[should_panic(expected = "Permission not found")]
    fn test_update_expiry_missing_permission() {
        let env = Env::default();
        let owner = Address::generate(&env);
        let delegate = Address::generate(&env);

        let contract_id = env.register(PermissionsContract, ());
        let client = PermissionsContractClient::new(&env, &contract_id);

        env.mock_all_auths();

        // Try to update expiry for non-existent permission
        client.update_expiry(&owner, &delegate, &1000);
    }
}
