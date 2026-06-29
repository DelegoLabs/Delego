#[cfg(test)]
mod test {
    use crate::{DataKey, EscrowContract, EscrowContractClient, EscrowError};
    use soroban_sdk::{testutils::Address as _, Address, Env, IntoVal};

    fn setup_client(env: &Env) -> (EscrowContractClient, Address) {
        let contract_id = env.register(EscrowContract, ());
        let client = EscrowContractClient::new(env, &contract_id);
        let admin = Address::generate(env);
        let treasury = Address::generate(env);
        client.initialize(&admin, &250u32, &treasury, &100i128, &1_000_000i128);
        (client, admin)
    }

    #[test]
    fn test_initialize() {
        let env = Env::default();
        let contract_id = env.register(EscrowContract, ());
        let client = EscrowContractClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);
        let fee_bps = 250u32;
        let min_amount = 100i128;
        let max_amount = 10000i128;

        let res = client.initialize(&admin, &fee_bps, &treasury, &min_amount, &max_amount);
        assert!(res);

        let res_try = client.try_initialize(&admin, &fee_bps, &treasury, &min_amount, &max_amount);
        assert_eq!(res_try, Err(Ok(EscrowError::AlreadyInitialized)));
    }

    // ─── Issue #179: Storage Key Namespace Tests ───────────────────────────────

    #[test]
    fn test_storage_keys_are_distinct() {
        // DataKey variants must not collide so that Escrow(id), Admin, Config,
        // and metadata entries never overwrite each other in contract storage.
        let env = Env::default();

        let addr_a = Address::generate(&env);
        let addr_b = Address::generate(&env);

        let key_admin = DataKey::Admin.into_val(&env);
        let key_escrow_0: soroban_sdk::Val = DataKey::Escrow(0u64).into_val(&env);
        let key_escrow_1: soroban_sdk::Val = DataKey::Escrow(1u64).into_val(&env);
        let key_last_id: soroban_sdk::Val = DataKey::LastEscrowId.into_val(&env);
        let key_pending: soroban_sdk::Val = DataKey::PendingAdmin.into_val(&env);
        let key_admin_list: soroban_sdk::Val = DataKey::AdminList.into_val(&env);
        let key_fee: soroban_sdk::Val = DataKey::FeeConfig.into_val(&env);
        let key_limits: soroban_sdk::Val = DataKey::AmountLimits.into_val(&env);
        let key_quorum: soroban_sdk::Val = DataKey::QuorumConfig.into_val(&env);
        let key_votes_0: soroban_sdk::Val = DataKey::DisputeVotes(0u64).into_val(&env);
        let key_whitelist: soroban_sdk::Val = DataKey::TokenWhitelist.into_val(&env);
        let key_token_a: soroban_sdk::Val = DataKey::TokenEnabled(addr_a.clone()).into_val(&env);
        let key_token_b: soroban_sdk::Val = DataKey::TokenEnabled(addr_b.clone()).into_val(&env);
        let key_pause: soroban_sdk::Val = DataKey::PauseState.into_val(&env);

        let all_keys: &[soroban_sdk::Val] = &[
            key_admin,
            key_escrow_0,
            key_escrow_1,
            key_last_id,
            key_pending,
            key_admin_list,
            key_fee,
            key_limits,
            key_quorum,
            key_votes_0,
            key_whitelist,
            key_token_a,
            key_token_b,
            key_pause,
        ];

        // Assert every key is unique by comparing raw val representations
        for i in 0..all_keys.len() {
            for j in (i + 1)..all_keys.len() {
                let i_raw = soroban_sdk::Val::get_payload(all_keys[i]);
                let j_raw = soroban_sdk::Val::get_payload(all_keys[j]);
                assert_ne!(
                    i_raw, j_raw,
                    "DataKey collision detected at indices {i} and {j}"
                );
            }
        }
    }

    #[test]
    fn test_escrow_ids_produce_distinct_keys() {
        let env = Env::default();
        // Different escrow IDs must map to different storage keys.
        let k0: soroban_sdk::Val = DataKey::Escrow(0u64).into_val(&env);
        let k1: soroban_sdk::Val = DataKey::Escrow(1u64).into_val(&env);
        let k999: soroban_sdk::Val = DataKey::Escrow(999u64).into_val(&env);
        assert_ne!(
            soroban_sdk::Val::get_payload(k0),
            soroban_sdk::Val::get_payload(k1)
        );
        assert_ne!(
            soroban_sdk::Val::get_payload(k1),
            soroban_sdk::Val::get_payload(k999)
        );
    }

    #[test]
    fn test_token_enabled_keys_differ_per_address() {
        let env = Env::default();
        let addr_a = Address::generate(&env);
        let addr_b = Address::generate(&env);
        let ka: soroban_sdk::Val = DataKey::TokenEnabled(addr_a).into_val(&env);
        let kb: soroban_sdk::Val = DataKey::TokenEnabled(addr_b).into_val(&env);
        assert_ne!(
            soroban_sdk::Val::get_payload(ka),
            soroban_sdk::Val::get_payload(kb)
        );
    }

    // ─── Issue #177 & #178: Admin Pause Flag + Event Tests ────────────────────

    #[test]
    fn test_set_create_paused_success() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, admin) = setup_client(&env);

        assert!(!client.get_create_paused());

        let res = client.set_create_paused(&admin, &true);
        assert!(res);
        assert!(client.get_create_paused());

        let res = client.set_create_paused(&admin, &false);
        assert!(res);
        assert!(!client.get_create_paused());
    }

    #[test]
    fn test_set_create_paused_unauthorized() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, _admin) = setup_client(&env);
        let non_admin = Address::generate(&env);

        let res = client.try_set_create_paused(&non_admin, &true);
        assert_eq!(res, Err(Ok(EscrowError::Unauthorized)));
    }

    // ─── Issue #176: Token Getter Tests ───────────────────────────────────────

    #[test]
    fn test_get_token_not_found() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, _admin) = setup_client(&env);

        let res = client.try_get_token(&999u64);
        assert_eq!(res, Err(Ok(EscrowError::NotFound)));
    }
}
