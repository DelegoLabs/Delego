#[cfg(test)]
mod test {
    use soroban_sdk::{testutils::{Address as _, Events}, Address, Env, Vec, TryIntoVal};
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

    // --- Issue #98: get_allowance_detail tests ---

    #[test]
    fn test_get_allowance_detail_fresh() {
        let env = Env::default();
        env.mock_all_auths();
        let owner = Address::generate(&env);
        let delegate = Address::generate(&env);

        let contract_id = env.register(PermissionsContract, ());
        let client = PermissionsContractClient::new(&env, &contract_id);

        let merchants = Vec::new(&env);
        client.grant(&owner, &delegate, &500, &100, &merchants, &10000);

        let detail = client.get_allowance_detail(&owner, &delegate);
        assert_eq!(detail.limit, 500);
        assert_eq!(detail.spent, 0);
        assert_eq!(detail.remaining, 500);
    }

    #[test]
    fn test_get_allowance_detail_partially_spent() {
        let env = Env::default();
        env.mock_all_auths();
        let owner = Address::generate(&env);
        let delegate = Address::generate(&env);
        let merchant = Address::generate(&env);

        let contract_id = env.register(PermissionsContract, ());
        let client = PermissionsContractClient::new(&env, &contract_id);

        let merchants = Vec::new(&env);
        client.grant(&owner, &delegate, &500, &100, &merchants, &10000);
        client.execute_spend(&owner, &delegate, &75, &merchant);

        let detail = client.get_allowance_detail(&owner, &delegate);
        assert_eq!(detail.limit, 500);
        assert_eq!(detail.spent, 75);
        assert_eq!(detail.remaining, 425);
    }

    #[test]
    fn test_get_allowance_detail_exhausted_clamped_at_zero() {
        let env = Env::default();
        env.mock_all_auths();
        let owner = Address::generate(&env);
        let delegate = Address::generate(&env);
        let merchant = Address::generate(&env);

        let contract_id = env.register(PermissionsContract, ());
        let client = PermissionsContractClient::new(&env, &contract_id);

        let merchants = Vec::new(&env);
        client.grant(&owner, &delegate, &100, &100, &merchants, &10000);
        client.execute_spend(&owner, &delegate, &100, &merchant);

        let detail = client.get_allowance_detail(&owner, &delegate);
        assert_eq!(detail.limit, 100);
        assert_eq!(detail.spent, 100);
        assert_eq!(detail.remaining, 0);
    }

    #[test]
    fn test_get_allowance_detail_not_found() {
        let env = Env::default();
        env.mock_all_auths();
        let owner = Address::generate(&env);
        let delegate = Address::generate(&env);

        let contract_id = env.register(PermissionsContract, ());
        let client = PermissionsContractClient::new(&env, &contract_id);

        let result = client.try_get_allowance_detail(&owner, &delegate);
        assert!(result.is_err());
    }

    // --- Issue #99: PermissionSpendEvent snapshot tests ---

    #[test]
    fn test_spend_event_emitted_on_success() {
        let env = Env::default();
        env.mock_all_auths();
        let owner = Address::generate(&env);
        let delegate = Address::generate(&env);
        let merchant = Address::generate(&env);

        let contract_id = env.register(PermissionsContract, ());
        let client = PermissionsContractClient::new(&env, &contract_id);

        let merchants = Vec::new(&env);
        client.grant(&owner, &delegate, &200, &100, &merchants, &10000);
        client.execute_spend(&owner, &delegate, &60, &merchant);

        let events = env.events().all();
        let mut found = false;
        for event in events.iter() {
            let (contract, topics, value) = event;
            if contract != contract_id || topics.len() != 2 {
                continue;
            }
            let t0: soroban_sdk::Symbol = topics.get(0).unwrap().try_into_val(&env).unwrap();
            let t1: soroban_sdk::Symbol = topics.get(1).unwrap().try_into_val(&env).unwrap();
            if t0 == soroban_sdk::symbol_short!("perm") && t1 == soroban_sdk::symbol_short!("spent") {
                let evt: crate::PermissionSpendEvent = value.try_into_val(&env).unwrap();
                assert_eq!(evt.owner, owner);
                assert_eq!(evt.delegate, delegate);
                assert_eq!(evt.merchant, merchant);
                assert_eq!(evt.amount, 60);
                assert_eq!(evt.remaining, 140);
                found = true;
            }
        }
        assert!(found, "PermissionSpendEvent not found in events");
    }

    #[test]
    #[should_panic(expected = "Spend not authorized")]
    fn test_spend_event_not_emitted_on_rejection() {
        let env = Env::default();
        env.mock_all_auths();
        let owner = Address::generate(&env);
        let delegate = Address::generate(&env);
        let merchant = Address::generate(&env);

        let contract_id = env.register(PermissionsContract, ());
        let client = PermissionsContractClient::new(&env, &contract_id);

        let merchants = Vec::new(&env);
        client.grant(&owner, &delegate, &50, &50, &merchants, &10000);
        // Exceeds total limit — panics before event is emitted.
        client.execute_spend(&owner, &delegate, &51, &merchant);
    }

    // --- Issue #103: version getter tests ---

    #[test]
    fn test_version_getter() {
        let env = Env::default();
        let contract_id = env.register(PermissionsContract, ());
        let client = PermissionsContractClient::new(&env, &contract_id);

        let v = client.version();
        assert_eq!(v.name, soroban_sdk::Symbol::new(&env, crate::CONTRACT_NAME));
        assert_eq!(v.semver, soroban_sdk::Symbol::new(&env, crate::CONTRACT_SEMVER));
    }

    // --- Issue #105: pause / resume / get_pause_metadata tests ---

    #[test]
    fn test_pause_blocks_spending() {
        let env = Env::default();
        env.mock_all_auths();
        let owner = Address::generate(&env);
        let delegate = Address::generate(&env);
        let merchant = Address::generate(&env);
        let admin = Address::generate(&env);

        let contract_id = env.register(PermissionsContract, ());
        let client = PermissionsContractClient::new(&env, &contract_id);

        let merchants = Vec::new(&env);
        client.grant(&owner, &delegate, &1000, &100, &merchants, &10000);
        assert!(client.can_spend(&owner, &delegate, &50, &merchant));

        let reason = soroban_sdk::symbol_short!("FRAUD");
        assert!(client.pause(&owner, &delegate, &admin, &reason));

        assert!(!client.can_spend(&owner, &delegate, &50, &merchant));
    }

    #[test]
    fn test_pause_stores_metadata() {
        let env = Env::default();
        env.mock_all_auths();
        let owner = Address::generate(&env);
        let delegate = Address::generate(&env);
        let admin = Address::generate(&env);

        let contract_id = env.register(PermissionsContract, ());
        let client = PermissionsContractClient::new(&env, &contract_id);

        let merchants = Vec::new(&env);
        client.grant(&owner, &delegate, &500, &100, &merchants, &10000);

        let reason = soroban_sdk::symbol_short!("REVIEW");
        client.pause(&owner, &delegate, &admin, &reason);

        let meta = client.get_pause_metadata(&owner, &delegate);
        assert_eq!(meta.paused_by, admin);
        assert_eq!(meta.reason_code, reason);
    }

    #[test]
    fn test_resume_restores_spending_and_clears_metadata() {
        let env = Env::default();
        env.mock_all_auths();
        let owner = Address::generate(&env);
        let delegate = Address::generate(&env);
        let merchant = Address::generate(&env);
        let admin = Address::generate(&env);

        let contract_id = env.register(PermissionsContract, ());
        let client = PermissionsContractClient::new(&env, &contract_id);

        let merchants = Vec::new(&env);
        client.grant(&owner, &delegate, &1000, &100, &merchants, &10000);

        let reason = soroban_sdk::symbol_short!("REVIEW");
        client.pause(&owner, &delegate, &admin, &reason);
        assert!(!client.can_spend(&owner, &delegate, &50, &merchant));

        assert!(client.resume(&owner, &delegate, &admin));
        assert!(client.can_spend(&owner, &delegate, &50, &merchant));

        let perm = client.get_permission(&owner, &delegate);
        assert_eq!(perm.status, crate::PermissionStatus::Active);
    }

    #[test]
    fn test_pause_on_non_active_returns_false() {
        let env = Env::default();
        env.mock_all_auths();
        let owner = Address::generate(&env);
        let delegate = Address::generate(&env);
        let admin = Address::generate(&env);

        let contract_id = env.register(PermissionsContract, ());
        let client = PermissionsContractClient::new(&env, &contract_id);

        let merchants = Vec::new(&env);
        client.grant(&owner, &delegate, &1000, &100, &merchants, &10000);
        client.revoke(&owner, &delegate);

        let reason = soroban_sdk::symbol_short!("FRAUD");
        assert!(!client.pause(&owner, &delegate, &admin, &reason));
    }
}
