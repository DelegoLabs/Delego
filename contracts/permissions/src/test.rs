#[cfg(test)]
mod test {
    use soroban_sdk::{testutils::Address as _, Address, Env, Vec};
    use crate::{PermissionsContract, PermissionsContractClient};

    #[test]
    fn test_merchant_in_whitelist_succeeds() {
        let env = Env::default();
        env.mock_all_auths();
        let owner = Address::generate(&env);
        let delegate = Address::generate(&env);
        let merchant = Address::generate(&env);

        let contract_id = env.register(PermissionsContract, ());
        let client = PermissionsContractClient::new(&env, &contract_id);

        let mut merchants = Vec::new(&env);
        merchants.push_back(merchant.clone());

        client.grant(&owner, &delegate, &100, &1000, &merchants, &10000);
        assert!(client.can_spend(&owner, &delegate, &50, &merchant));
    }

    #[test]
    fn test_merchant_not_in_whitelist_fails() {
        let env = Env::default();
        env.mock_all_auths();
        let owner = Address::generate(&env);
        let delegate = Address::generate(&env);
        let allowed_merchant = Address::generate(&env);
        let other_merchant = Address::generate(&env);

        let contract_id = env.register(PermissionsContract, ());
        let client = PermissionsContractClient::new(&env, &contract_id);

        let mut merchants = Vec::new(&env);
        merchants.push_back(allowed_merchant.clone());

        client.grant(&owner, &delegate, &100, &1000, &merchants, &10000);
        assert!(!client.can_spend(&owner, &delegate, &50, &other_merchant));
    }

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
    fn test_delegate_status_active() {
        let env = Env::default();
        let owner = Address::generate(&env);
        let delegate = Address::generate(&env);

        let contract_id = env.register(PermissionsContract, ());
        let client = PermissionsContractClient::new(&env, &contract_id);

        env.mock_all_auths();

        let merchants = Vec::new(&env);
        client.grant(&owner, &delegate, &1000, &100, &merchants, &10000);

        let status = client.get_delegate_status(&owner, &delegate);
        assert!(status.active);
        assert_eq!(status.reason, soroban_sdk::symbol_short!("active"));
        assert_eq!(status.remaining, 1000);
    }

    #[test]
    fn test_delegate_status_revoked() {
        let env = Env::default();
        let owner = Address::generate(&env);
        let delegate = Address::generate(&env);

        let contract_id = env.register(PermissionsContract, ());
        let client = PermissionsContractClient::new(&env, &contract_id);

        env.mock_all_auths();

        let merchants = Vec::new(&env);
        client.grant(&owner, &delegate, &1000, &100, &merchants, &10000);
        client.revoke(&owner, &delegate);

        let status = client.get_delegate_status(&owner, &delegate);
        assert!(!status.active);
        assert_eq!(status.reason, soroban_sdk::symbol_short!("revoked"));
    }

    #[test]
    fn test_delegate_status_expired() {
        use soroban_sdk::testutils::Ledger;

        let env = Env::default();
        let owner = Address::generate(&env);
        let delegate = Address::generate(&env);

        let contract_id = env.register(PermissionsContract, ());
        let client = PermissionsContractClient::new(&env, &contract_id);

        env.mock_all_auths();

        let merchants = Vec::new(&env);
        let ttl_ledgers = 100u32;
        client.grant(&owner, &delegate, &1000, &100, &merchants, &ttl_ledgers);

        env.ledger().set_sequence_number(env.ledger().sequence() + ttl_ledgers + 1);

        let status = client.get_delegate_status(&owner, &delegate);
        assert!(!status.active);
        assert_eq!(status.reason, soroban_sdk::symbol_short!("expired"));
    }

    #[test]
    fn test_delegate_status_exhausted() {
        let env = Env::default();
        let owner = Address::generate(&env);
        let delegate = Address::generate(&env);
        let merchant = Address::generate(&env);

        let contract_id = env.register(PermissionsContract, ());
        let client = PermissionsContractClient::new(&env, &contract_id);

        env.mock_all_auths();

        let merchants = Vec::new(&env);
        client.grant(&owner, &delegate, &100, &100, &merchants, &10000);
        client.execute_spend(&owner, &delegate, &100, &merchant);

        let status = client.get_delegate_status(&owner, &delegate);
        assert!(!status.active);
        assert_eq!(status.reason, soroban_sdk::symbol_short!("exhausted"));
        assert_eq!(status.remaining, 0);
    }

    #[test]
    fn test_delegate_status_paused() {
        let env = Env::default();
        let owner = Address::generate(&env);
        let delegate = Address::generate(&env);

        let contract_id = env.register(PermissionsContract, ());
        let client = PermissionsContractClient::new(&env, &contract_id);

        env.mock_all_auths();

        let merchants = Vec::new(&env);
        client.grant(&owner, &delegate, &1000, &100, &merchants, &10000);

        // No public setter exists yet for Paused, so the test writes the
        // record directly, the same way a future pause() admin call would.
        env.as_contract(&contract_id, || {
            let key = crate::DataKey::Permission(owner.clone(), delegate.clone());
            let mut record: crate::PermissionRecord =
                env.storage().persistent().get(&key).unwrap();
            record.status = crate::PermissionStatus::Paused;
            env.storage().persistent().set(&key, &record);
        });

        let status = client.get_delegate_status(&owner, &delegate);
        assert!(!status.active);
        assert_eq!(status.reason, soroban_sdk::symbol_short!("paused"));
    }
}