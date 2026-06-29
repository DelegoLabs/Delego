#[cfg(test)]
mod test {
    use crate::{PermissionError, PermissionsContract, PermissionsContractClient};
    use soroban_sdk::{
        testutils::{Address as _, Events, Ledger},
        Address, Env, TryIntoVal, Vec,
    };

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

        client.grant(&owner, &delegate, &1000, &100, &merchants, &10000);
        assert_eq!(
            client.try_can_spend(&owner, &delegate, &50, &merchant),
            Ok(Ok(()))
        );
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

        client.grant(&owner, &delegate, &1000, &100, &merchants, &10000);
        assert_eq!(
            client.try_can_spend(&owner, &delegate, &50, &other_merchant),
            Err(Ok(PermissionError::MerchantNotAllowed))
        );
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

        client.grant(&owner, &delegate, &1000, &100, &merchants, &10000);
        assert_eq!(
            client.try_can_spend(&owner, &delegate, &50, &merchant),
            Ok(Ok(()))
        );
    }

    #[test]
    fn test_grant_rejects_invalid_params() {
        let env = Env::default();
        env.mock_all_auths();
        let owner = Address::generate(&env);
        let delegate = Address::generate(&env);

        let contract_id = env.register(PermissionsContract, ());
        let client = PermissionsContractClient::new(&env, &contract_id);

        let merchants = Vec::new(&env);

        // Zero per-tx limit is invalid.
        assert_eq!(
            client.try_grant(&owner, &delegate, &1000, &0, &merchants, &10000),
            Err(Ok(PermissionError::InvalidParam))
        );

        // Total smaller than a single per-tx spend is invalid.
        assert_eq!(
            client.try_grant(&owner, &delegate, &100, &1000, &merchants, &10000),
            Err(Ok(PermissionError::InvalidParam))
        );
    }

    #[test]
    fn test_revoke_not_found() {
        let env = Env::default();
        env.mock_all_auths();
        let owner = Address::generate(&env);
        let delegate = Address::generate(&env);

        let contract_id = env.register(PermissionsContract, ());
        let client = PermissionsContractClient::new(&env, &contract_id);

        assert_eq!(
            client.try_revoke(&owner, &delegate),
            Err(Ok(PermissionError::NotFound))
        );
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
        client.grant(&owner, &delegate, &1000, &100, &merchants, &10000);
        client.revoke(&owner, &delegate);
        assert_eq!(
            client.try_can_spend(&owner, &delegate, &50, &merchant),
            Err(Ok(PermissionError::Unauthorized))
        );
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
        client.grant(&owner, &delegate, &1000, &100, &merchants, &10000);

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
        client.grant(&owner, &delegate, &1000, &100, &merchants, &10000);
        assert_eq!(client.get_remaining_allowance(&owner, &delegate), 1000);

        client.execute_spend(&owner, &delegate, &30, &merchant);
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
            if t0 == soroban_sdk::symbol_short!("perm") && t1 == soroban_sdk::symbol_short!("spent")
            {
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

        // Exceeds the per-tx limit — returns a typed error before any event is emitted.
        let res = client.try_execute_spend(&owner, &delegate, &51, &merchant);
        assert_eq!(res, Err(Ok(PermissionError::ExceedsPerTxLimit)));

        // No spend event should have been published.
        let events = env.events().all();
        for event in events.iter() {
            let (contract, topics, _value) = event;
            if contract != contract_id || topics.len() != 2 {
                continue;
            }
            let t0: soroban_sdk::Symbol = topics.get(0).unwrap().try_into_val(&env).unwrap();
            let t1: soroban_sdk::Symbol = topics.get(1).unwrap().try_into_val(&env).unwrap();
            assert!(
                !(t0 == soroban_sdk::symbol_short!("perm")
                    && t1 == soroban_sdk::symbol_short!("spent")),
                "PermissionSpendEvent must not be emitted on rejection"
            );
        }
    }

    // --- Issue #103: version getter tests ---

    #[test]
    fn test_version_getter() {
        let env = Env::default();
        let contract_id = env.register(PermissionsContract, ());
        let client = PermissionsContractClient::new(&env, &contract_id);

        let v = client.version();
        assert_eq!(v.name, soroban_sdk::Symbol::new(&env, crate::CONTRACT_NAME));
        assert_eq!(
            v.semver,
            soroban_sdk::Symbol::new(&env, crate::CONTRACT_SEMVER)
        );
    }

    // --- Issue #105: pause / resume / get_pause_metadata tests ---

    #[test]
    fn test_pause_blocks_spending() {
        let env = Env::default();
        env.mock_all_auths();
        let owner = Address::generate(&env);
        let delegate = Address::generate(&env);
        let merchant = Address::generate(&env);
        let _admin = Address::generate(&env);

        let contract_id = env.register(PermissionsContract, ());
        let client = PermissionsContractClient::new(&env, &contract_id);

        let merchants = Vec::new(&env);
        client.grant(&owner, &delegate, &1000, &100, &merchants, &10000);
        assert_eq!(
            client.try_can_spend(&owner, &delegate, &50, &merchant),
            Ok(Ok(()))
        );

        client.pause(&owner, &delegate);

        assert_eq!(
            client.try_can_spend(&owner, &delegate, &50, &merchant),
            Err(Ok(PermissionError::PermissionPaused))
        );
    }

    #[test]
    fn test_pause_stores_metadata() {
        let env = Env::default();
        env.mock_all_auths();
        let owner = Address::generate(&env);
        let delegate = Address::generate(&env);
        let _admin = Address::generate(&env);

        let contract_id = env.register(PermissionsContract, ());
        let client = PermissionsContractClient::new(&env, &contract_id);

        let merchants = Vec::new(&env);
        client.grant(&owner, &delegate, &500, &100, &merchants, &10000);

        client.pause(&owner, &delegate);

        // PauseMetadata isn't there anymore, let's just assert it is paused
        let perm = client.get_permission(&owner, &delegate);
        assert_eq!(perm.status, crate::PermissionStatus::Paused);
    }

    #[test]
    fn test_resume_restores_spending_and_clears_metadata() {
        let env = Env::default();
        env.mock_all_auths();
        let owner = Address::generate(&env);
        let delegate = Address::generate(&env);
        let merchant = Address::generate(&env);
        let _admin = Address::generate(&env);

        let contract_id = env.register(PermissionsContract, ());
        let client = PermissionsContractClient::new(&env, &contract_id);

        let merchants = Vec::new(&env);
        client.grant(&owner, &delegate, &1000, &100, &merchants, &10000);

        client.pause(&owner, &delegate);

        assert_eq!(
            client.try_can_spend(&owner, &delegate, &50, &merchant),
            Err(Ok(PermissionError::PermissionPaused))
        );

        client.resume(&owner, &delegate);
        assert_eq!(
            client.try_can_spend(&owner, &delegate, &50, &merchant),
            Ok(Ok(()))
        );

        let perm = client.get_permission(&owner, &delegate);
        assert_eq!(perm.status, crate::PermissionStatus::Active);
    }

    #[test]
    fn test_pause_on_non_active_returns_false() {
        let env = Env::default();
        env.mock_all_auths();
        let owner = Address::generate(&env);
        let delegate = Address::generate(&env);
        let _admin = Address::generate(&env);

        let contract_id = env.register(PermissionsContract, ());
        let client = PermissionsContractClient::new(&env, &contract_id);

        let merchants = Vec::new(&env);
        client.grant(&owner, &delegate, &1000, &100, &merchants, &10000);
        client.revoke(&owner, &delegate);

        let res = client.try_pause(&owner, &delegate);
        assert!(res.is_err());
    }

    #[test]
    fn test_double_pause_returns_error() {
        let env = Env::default();
        env.mock_all_auths();
        let owner = Address::generate(&env);
        let delegate = Address::generate(&env);

        let contract_id = env.register(PermissionsContract, ());
        let client = PermissionsContractClient::new(&env, &contract_id);

        let merchants = Vec::new(&env);
        client.grant(&owner, &delegate, &1000, &100, &merchants, &10000);

        client.pause(&owner, &delegate);
        let res = client.try_pause(&owner, &delegate);
        assert!(res.is_err());
    }

    #[test]
    fn test_resume_on_active_returns_error() {
        let env = Env::default();
        env.mock_all_auths();
        let owner = Address::generate(&env);
        let delegate = Address::generate(&env);

        let contract_id = env.register(PermissionsContract, ());
        let client = PermissionsContractClient::new(&env, &contract_id);

        let merchants = Vec::new(&env);
        client.grant(&owner, &delegate, &1000, &100, &merchants, &10000);

        let res = client.try_resume(&owner, &delegate);
        assert!(res.is_err());
    }

    // --- Issue #186: Admin pause for new permission grants ---

    #[test]
    fn test_pause_grants_blocks_new_grants() {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let owner = Address::generate(&env);
        let delegate = Address::generate(&env);

        let contract_id = env.register(PermissionsContract, ());
        let client = PermissionsContractClient::new(&env, &contract_id);

        client.set_admin(&admin);
        client.pause_grants(&admin);

        let merchants = Vec::new(&env);
        let res = client.try_grant(&owner, &delegate, &1000, &100, &merchants, &10000);
        assert_eq!(res, Err(Ok(PermissionError::GrantsPaused)));
    }

    #[test]
    fn test_unpause_grants_allows_new_grants() {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let owner = Address::generate(&env);
        let delegate = Address::generate(&env);

        let contract_id = env.register(PermissionsContract, ());
        let client = PermissionsContractClient::new(&env, &contract_id);

        client.set_admin(&admin);
        client.pause_grants(&admin);
        client.unpause_grants(&admin);

        let merchants = Vec::new(&env);
        let res = client.try_grant(&owner, &delegate, &1000, &100, &merchants, &10000);
        assert_eq!(res, Ok(Ok(())));
    }

    #[test]
    fn test_pause_grants_allows_revoke() {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let owner = Address::generate(&env);
        let delegate = Address::generate(&env);

        let contract_id = env.register(PermissionsContract, ());
        let client = PermissionsContractClient::new(&env, &contract_id);

        let merchants = Vec::new(&env);
        client.grant(&owner, &delegate, &1000, &100, &merchants, &10000);

        client.set_admin(&admin);
        client.pause_grants(&admin);

        // Revoke should still work while grants are paused
        let res = client.try_revoke(&owner, &delegate);
        assert_eq!(res, Ok(Ok(())));
    }

    #[test]
    fn test_pause_grants_allows_getter() {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let owner = Address::generate(&env);
        let delegate = Address::generate(&env);

        let contract_id = env.register(PermissionsContract, ());
        let client = PermissionsContractClient::new(&env, &contract_id);

        let merchants = Vec::new(&env);
        client.grant(&owner, &delegate, &1000, &100, &merchants, &10000);

        client.set_admin(&admin);
        client.pause_grants(&admin);

        // get_permission should still work while grants are paused
        let perm = client.get_permission(&owner, &delegate);
        assert_eq!(perm.limit_total, 1000);
    }

    #[test]
    fn test_get_grant_pause_state_default() {
        let env = Env::default();
        let contract_id = env.register(PermissionsContract, ());
        let client = PermissionsContractClient::new(&env, &contract_id);

        let state = client.get_grant_pause_state();
        assert!(!state.grants_paused);
        assert_eq!(state.updated_at_ledger, 0);
    }

    #[test]
    fn test_pause_grants_unauthorized() {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let other = Address::generate(&env);

        let contract_id = env.register(PermissionsContract, ());
        let client = PermissionsContractClient::new(&env, &contract_id);

        client.set_admin(&admin);

        let res = client.try_pause_grants(&other);
        assert_eq!(res, Err(Ok(PermissionError::Unauthorized)));
    }

    // --- Issue #189: AllowanceDecreasedEvent tests ---

    #[test]
    fn test_allowance_decreased_event_emitted() {
        let env = Env::default();
        env.mock_all_auths();
        let owner = Address::generate(&env);
        let delegate = Address::generate(&env);

        let contract_id = env.register(PermissionsContract, ());
        let client = PermissionsContractClient::new(&env, &contract_id);

        let merchants = Vec::new(&env);
        client.grant(&owner, &delegate, &1000, &100, &merchants, &10000);

        // Queue a decrease
        client.decrease_allowance(&owner, &delegate, &200);

        // Advance timestamp past 24h timelock
        env.ledger().with_mut(|li| {
            li.timestamp = li.timestamp + 86401;
        });

        // Execute the decrease
        client.execute_decrease_allowance(&owner, &delegate);

        // Verify AllowanceDecreasedEvent was emitted
        let events = env.events().all();
        let mut found = false;
        for event in events.iter() {
            let (contract, topics, value) = event;
            if contract != contract_id || topics.len() != 2 {
                continue;
            }
            let t0: soroban_sdk::Symbol = topics.get(0).unwrap().try_into_val(&env).unwrap();
            let t1: soroban_sdk::Symbol = topics.get(1).unwrap().try_into_val(&env).unwrap();
            if t0 == soroban_sdk::symbol_short!("perm")
                && t1 == soroban_sdk::symbol_short!("allowdec")
            {
                let evt: crate::AllowanceDecreasedEvent = value.try_into_val(&env).unwrap();
                assert_eq!(evt.owner, owner);
                assert_eq!(evt.delegate, delegate);
                assert_eq!(evt.old_limit, 1000);
                assert_eq!(evt.new_limit, 800);
                found = true;
            }
        }
        assert!(found, "AllowanceDecreasedEvent not found in events");
    }

    #[test]
    fn test_allowance_decreased_event_correct_values() {
        let env = Env::default();
        env.mock_all_auths();
        let owner = Address::generate(&env);
        let delegate = Address::generate(&env);
        let merchant = Address::generate(&env);

        let contract_id = env.register(PermissionsContract, ());
        let client = PermissionsContractClient::new(&env, &contract_id);

        let merchants = Vec::new(&env);
        client.grant(&owner, &delegate, &500, &100, &merchants, &10000);

        // Spend some first
        client.execute_spend(&owner, &delegate, &50, &merchant);

        // Decrease allowance by 100 (new limit: 400, spent: 50)
        client.decrease_allowance(&owner, &delegate, &100);
        env.ledger().with_mut(|li| {
            li.timestamp = li.timestamp + 86401;
        });
        client.execute_decrease_allowance(&owner, &delegate);

        // Verify remaining allowance after decrease
        let detail = client.get_allowance_detail(&owner, &delegate);
        assert_eq!(detail.limit, 400);
        assert_eq!(detail.spent, 50);
        assert_eq!(detail.remaining, 350);
    }
}
