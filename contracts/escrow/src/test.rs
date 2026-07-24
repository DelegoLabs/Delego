#[cfg(test)]
mod test {
    use crate::{
        DataKey, EscrowContract, EscrowContractClient, EscrowError, EscrowMetadataEvent,
    };
    use soroban_sdk::{
        symbol_short,
        testutils::{Address as _, Events},
        Address, BytesN, Env, IntoVal, TryIntoVal,
    };

    fn setup_client(env: &Env) -> (EscrowContractClient<'_>, Address, Address) {
        let contract_id = env.register(EscrowContract, ());
        let client = EscrowContractClient::new(env, &contract_id);
        let admin = Address::generate(env);
        let treasury = Address::generate(env);
        client.initialize(&admin, &250u32, &treasury, &100i128, &1_000_000i128);
        (client, admin, contract_id)
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
        let key_metadata_0: soroban_sdk::Val = DataKey::EscrowMetadata(0u64).into_val(&env);
        let key_metadata_1: soroban_sdk::Val = DataKey::EscrowMetadata(1u64).into_val(&env);
        let key_migration: soroban_sdk::Val = DataKey::MigrationFlag.into_val(&env);
        let key_fee_dist: soroban_sdk::Val = DataKey::FeeDistribution.into_val(&env);

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
            key_metadata_0,
            key_metadata_1,
            key_migration,
            key_fee_dist,
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

    #[test]
    fn test_metadata_keys_differ_per_escrow_id() {
        let env = Env::default();
        // Different escrow IDs must map to different metadata storage keys.
        let k0: soroban_sdk::Val = DataKey::EscrowMetadata(0u64).into_val(&env);
        let k1: soroban_sdk::Val = DataKey::EscrowMetadata(1u64).into_val(&env);
        let k999: soroban_sdk::Val = DataKey::EscrowMetadata(999u64).into_val(&env);
        assert_ne!(
            soroban_sdk::Val::get_payload(k0),
            soroban_sdk::Val::get_payload(k1)
        );
        assert_ne!(
            soroban_sdk::Val::get_payload(k1),
            soroban_sdk::Val::get_payload(k999)
        );
    }

    // ─── Issue #177 & #178: Admin Pause Flag + Event Tests ────────────────────

    #[test]
    fn test_set_create_paused_success() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, admin, _contract_id) = setup_client(&env);

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
        let (client, _admin, _contract_id) = setup_client(&env);
        let non_admin = Address::generate(&env);

        let res = client.try_set_create_paused(&non_admin, &true);
        assert_eq!(res, Err(Ok(EscrowError::Unauthorized)));
    }

    // ─── Issue #176: Token Getter Tests ───────────────────────────────────────

    #[test]
    fn test_get_token_not_found() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, _admin, _contract_id) = setup_client(&env);

        let res = client.try_get_token(&999u64);
        assert_eq!(res, Err(Ok(EscrowError::NotFound)));
    }

    // ─── Issue #172: Escrow Creation Metadata Hash Tests ─────────────────────

    #[test]
    fn test_deposit_with_metadata_success() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, admin, _contract_id) = setup_client(&env);

        let buyer = Address::generate(&env);
        let seller = Address::generate(&env);
        let token_admin = Address::generate(&env);
        let token = env.register_stellar_asset_contract_v2(token_admin).address();
        let token_admin_client = soroban_sdk::token::StellarAssetClient::new(&env, &token);
        token_admin_client.mint(&buyer, &10000i128);
        client.add_token(&admin, &token);

        let order_id = BytesN::from_array(&env, &[1u8; 32]);
        let order_hash = BytesN::from_array(&env, &[2u8; 32]);
        let schema = soroban_sdk::symbol_short!("order_v1");

        let escrow_id = client.deposit(
            &buyer,
            &seller,
            &token,
            &1000i128,
            &order_id,
            &100u32,
            &Some(order_hash.clone()),
            &Some(schema.clone()),
        );

        // Verify metadata was stored
        let metadata = client.get_escrow_metadata(&escrow_id);
        assert_eq!(metadata.order_hash, order_hash);
        assert_eq!(metadata.schema, schema);
    }

    #[test]
    fn test_deposit_without_metadata() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, admin, _contract_id) = setup_client(&env);

        let buyer = Address::generate(&env);
        let seller = Address::generate(&env);
        let token_admin = Address::generate(&env);
        let token = env.register_stellar_asset_contract_v2(token_admin).address();
        let token_admin_client = soroban_sdk::token::StellarAssetClient::new(&env, &token);
        token_admin_client.mint(&buyer, &10000i128);
        client.add_token(&admin, &token);

        let order_id = BytesN::from_array(&env, &[1u8; 32]);

        // Deposit without metadata (None for both parameters)
        let escrow_id = client.deposit(
            &buyer,
            &seller,
            &token,
            &1000i128,
            &order_id,
            &100u32,
            &None,
            &None,
        );

        // Verify metadata is not found
        let res = client.try_get_escrow_metadata(&escrow_id);
        assert_eq!(res, Err(Ok(EscrowError::NotFound)));
    }

    #[test]
    fn test_deposit_with_partial_metadata() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, admin, _contract_id) = setup_client(&env);

        let buyer = Address::generate(&env);
        let seller = Address::generate(&env);
        let token_admin = Address::generate(&env);
        let token = env.register_stellar_asset_contract_v2(token_admin).address();
        let token_admin_client = soroban_sdk::token::StellarAssetClient::new(&env, &token);
        token_admin_client.mint(&buyer, &10000i128);
        client.add_token(&admin, &token);

        let order_id = BytesN::from_array(&env, &[1u8; 32]);
        let order_hash = BytesN::from_array(&env, &[2u8; 32]);

        // Deposit with only order_hash (schema is None)
        let escrow_id = client.deposit(
            &buyer,
            &seller,
            &token,
            &1000i128,
            &order_id,
            &100u32,
            &Some(order_hash),
            &None,
        );

        // Verify metadata is not stored when only one parameter is provided
        let res = client.try_get_escrow_metadata(&escrow_id);
        assert_eq!(res, Err(Ok(EscrowError::NotFound)));
    }

    #[test]
    fn test_get_escrow_metadata_not_found() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, _admin, _contract_id) = setup_client(&env);

        // Try to get metadata for non-existent escrow
        let res = client.try_get_escrow_metadata(&999u64);
        assert_eq!(res, Err(Ok(EscrowError::NotFound)));
    }

    // ─── Issue #175: Escrow Metadata Event Tests ─────────────────────────────

    #[test]
    fn test_deposit_with_metadata_emits_metadata_event() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, admin, contract_id) = setup_client(&env);

        let buyer = Address::generate(&env);
        let seller = Address::generate(&env);
        let token_admin = Address::generate(&env);
        let token = env.register_stellar_asset_contract_v2(token_admin).address();
        let token_admin_client = soroban_sdk::token::StellarAssetClient::new(&env, &token);
        token_admin_client.mint(&buyer, &10000i128);
        client.add_token(&admin, &token);

        let order_id = BytesN::from_array(&env, &[1u8; 32]);
        let order_hash = BytesN::from_array(&env, &[2u8; 32]);
        let schema = symbol_short!("order_v1");

        client.deposit(
            &buyer,
            &seller,
            &token,
            &1000i128,
            &order_id,
            &100u32,
            &Some(order_hash.clone()),
            &Some(schema.clone()),
        );

        let events = env.events().all();
        let mut found = false;
        for event in events.iter() {
            let (contract, topics, value) = event;
            if contract != contract_id || topics.len() != 2 {
                continue;
            }
            let t0: soroban_sdk::Symbol = topics.get(0).unwrap().try_into_val(&env).unwrap();
            let t1: soroban_sdk::Symbol = topics.get(1).unwrap().try_into_val(&env).unwrap();
            if t0 == symbol_short!("escrow") && t1 == symbol_short!("metadata") {
                let evt: EscrowMetadataEvent = value.try_into_val(&env).unwrap();
                assert_eq!(evt.escrow_id, order_id);
                assert_eq!(evt.order_hash, order_hash);
                assert_eq!(evt.schema, schema);
                found = true;
            }
        }
        assert!(found, "EscrowMetadataEvent not found in events");
    }

    #[test]
    fn test_deposit_without_metadata_does_not_emit_metadata_event() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, admin, contract_id) = setup_client(&env);

        let buyer = Address::generate(&env);
        let seller = Address::generate(&env);
        let token_admin = Address::generate(&env);
        let token = env.register_stellar_asset_contract_v2(token_admin).address();
        let token_admin_client = soroban_sdk::token::StellarAssetClient::new(&env, &token);
        token_admin_client.mint(&buyer, &10000i128);
        client.add_token(&admin, &token);

        let order_id = BytesN::from_array(&env, &[1u8; 32]);

        client.deposit(
            &buyer,
            &seller,
            &token,
            &1000i128,
            &order_id,
            &100u32,
            &None,
            &None,
        );

        for event in env.events().all().iter() {
            let (contract, topics, _value) = event;
            if contract != contract_id || topics.len() != 2 {
                continue;
            }
            let t0: soroban_sdk::Symbol = topics.get(0).unwrap().try_into_val(&env).unwrap();
            let t1: soroban_sdk::Symbol = topics.get(1).unwrap().try_into_val(&env).unwrap();
            assert!(
                !(t0 == symbol_short!("escrow") && t1 == symbol_short!("metadata")),
                "EscrowMetadataEvent must not be emitted when metadata is absent"
            );
        }
    }

    #[test]
    fn test_deposit_with_partial_metadata_does_not_emit_metadata_event() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, admin, contract_id) = setup_client(&env);

        let buyer = Address::generate(&env);
        let seller = Address::generate(&env);
        let token_admin = Address::generate(&env);
        let token = env.register_stellar_asset_contract_v2(token_admin).address();
        let token_admin_client = soroban_sdk::token::StellarAssetClient::new(&env, &token);
        token_admin_client.mint(&buyer, &10000i128);
        client.add_token(&admin, &token);

        let order_id = BytesN::from_array(&env, &[1u8; 32]);
        let order_hash = BytesN::from_array(&env, &[2u8; 32]);

        client.deposit(
            &buyer,
            &seller,
            &token,
            &1000i128,
            &order_id,
            &100u32,
            &Some(order_hash),
            &None,
        );

        for event in env.events().all().iter() {
            let (contract, topics, _value) = event;
            if contract != contract_id || topics.len() != 2 {
                continue;
            }
            let t0: soroban_sdk::Symbol = topics.get(0).unwrap().try_into_val(&env).unwrap();
            let t1: soroban_sdk::Symbol = topics.get(1).unwrap().try_into_val(&env).unwrap();
            assert!(
                !(t0 == symbol_short!("escrow") && t1 == symbol_short!("metadata")),
                "EscrowMetadataEvent must not be emitted for partial metadata"
            );
        }
    }

    // ─── Merchant Escrow Cancellation Tests ──────────────────────────────────

    #[test]
    fn test_merchant_cancel_created_escrow_success() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, admin, contract_id) = setup_client(&env);

        let buyer = Address::generate(&env);
        let seller = Address::generate(&env);
        let token_admin = Address::generate(&env);
        let token = env.register_stellar_asset_contract_v2(token_admin).address();
        client.add_token(&admin, &token);

        let order_id = BytesN::from_array(&env, &[7u8; 32]);
        let reason = symbol_short!("out_stock");

        let escrow_id = client.create(
            &buyer,
            &seller,
            &token,
            &1000i128,
            &order_id,
            &100u32,
            &None,
            &None,
        );

        let record = client.get_escrow(&escrow_id);
        assert_eq!(record.status, crate::EscrowStatus::Created);

        let cancelled = client.cancel(&escrow_id, &seller, &reason);
        assert!(cancelled);

        // Verify EscrowCancelledEvent emission (retrieve events right after contract call)
        let events = env.events().all();

        let updated_record = client.get_escrow(&escrow_id);
        assert_eq!(updated_record.status, crate::EscrowStatus::Cancelled);

        let mut found = false;
        for event in events.iter() {
            let (c_id, topics, value) = event;
            if c_id != contract_id || topics.len() != 2 {
                continue;
            }
            let t0: soroban_sdk::Symbol = topics.get(0).unwrap().try_into_val(&env).unwrap();
            let t1: soroban_sdk::Symbol = topics.get(1).unwrap().try_into_val(&env).unwrap();
            if t0 == symbol_short!("escrow") && t1 == symbol_short!("cancelled") {
                let evt: crate::EscrowCancelledEvent = value.try_into_val(&env).unwrap();
                assert_eq!(evt.escrow_id, order_id);
                assert_eq!(evt.cancelled_by, seller);
                assert_eq!(evt.reason, reason);
                found = true;
            }
        }
        assert!(found, "EscrowCancelledEvent was not emitted");
    }

    #[test]
    fn test_cancel_unauthorized_caller_fails() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, admin, _contract_id) = setup_client(&env);

        let buyer = Address::generate(&env);
        let seller = Address::generate(&env);
        let random_caller = Address::generate(&env);
        let token_admin = Address::generate(&env);
        let token = env.register_stellar_asset_contract_v2(token_admin).address();
        client.add_token(&admin, &token);

        let order_id = BytesN::from_array(&env, &[8u8; 32]);
        let reason = symbol_short!("no_stock");

        let escrow_id = client.create(
            &buyer,
            &seller,
            &token,
            &1000i128,
            &order_id,
            &100u32,
            &None,
            &None,
        );

        let res = client.try_cancel(&escrow_id, &random_caller, &reason);
        assert_eq!(res, Err(Ok(EscrowError::Unauthorized)));
    }

    #[test]
    fn test_cancel_after_funded_fails() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, admin, _contract_id) = setup_client(&env);

        let buyer = Address::generate(&env);
        let seller = Address::generate(&env);
        let token_admin = Address::generate(&env);
        let token = env.register_stellar_asset_contract_v2(token_admin).address();
        let token_admin_client = soroban_sdk::token::StellarAssetClient::new(&env, &token);
        token_admin_client.mint(&buyer, &10000i128);
        client.add_token(&admin, &token);

        let order_id = BytesN::from_array(&env, &[9u8; 32]);
        let reason = symbol_short!("too_late");

        let escrow_id = client.deposit(
            &buyer,
            &seller,
            &token,
            &1000i128,
            &order_id,
            &100u32,
            &None,
            &None,
        );

        let record = client.get_escrow(&escrow_id);
        assert_eq!(record.status, crate::EscrowStatus::Funded);

        let res = client.try_cancel(&escrow_id, &seller, &reason);
        assert_eq!(res, Err(Ok(EscrowError::AlreadyFunded)));
    }

    #[test]
    fn test_cancel_already_cancelled_fails() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, admin, _contract_id) = setup_client(&env);

        let buyer = Address::generate(&env);
        let seller = Address::generate(&env);
        let token_admin = Address::generate(&env);
        let token = env.register_stellar_asset_contract_v2(token_admin).address();
        client.add_token(&admin, &token);

        let order_id = BytesN::from_array(&env, &[10u8; 32]);
        let reason = symbol_short!("duplicate");

        let escrow_id = client.create(
            &buyer,
            &seller,
            &token,
            &1000i128,
            &order_id,
            &100u32,
            &None,
            &None,
        );

        client.cancel(&escrow_id, &seller, &reason);

        let res = client.try_cancel(&escrow_id, &seller, &reason);
        assert_eq!(res, Err(Ok(EscrowError::AlreadyCancelled)));
    }

    #[test]
    fn test_funding_cancelled_escrow_fails() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, admin, _contract_id) = setup_client(&env);

        let buyer = Address::generate(&env);
        let seller = Address::generate(&env);
        let token_admin = Address::generate(&env);
        let token = env.register_stellar_asset_contract_v2(token_admin).address();
        client.add_token(&admin, &token);

        let order_id = BytesN::from_array(&env, &[11u8; 32]);
        let reason = symbol_short!("cancelled");

        let escrow_id = client.create(
            &buyer,
            &seller,
            &token,
            &1000i128,
            &order_id,
            &100u32,
            &None,
            &None,
        );

        client.cancel(&escrow_id, &seller, &reason);

        let res = client.try_fund(&escrow_id, &buyer);
        assert_eq!(res, Err(Ok(EscrowError::AlreadyCancelled)));
    }

    // ─── Issue #325: Upgrade Path + Version Check Tests ───────────────────────

    // A minimal Soroban contract (a single `ping` function, no storage) compiled
    // for wasm32-unknown-unknown. The host requires a valid contract WASM (with
    // the standard contract metadata section) to accept an `upload_contract_wasm`
    // call, so a bare/empty module is not sufficient here. This stub's exported
    // functions are never invoked — it only serves as the upgrade target so
    // `upgrade` has a real contract-code ledger entry to point at.
    const WASM_STUB: &[u8] = &[
        0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02, 0x60, 0x00, 0x01, 0x7e,
        0x60, 0x00, 0x00, 0x03, 0x03, 0x02, 0x00, 0x01, 0x05, 0x03, 0x01, 0x00, 0x10, 0x06, 0x09,
        0x01, 0x7f, 0x01, 0x41, 0x80, 0x80, 0xc0, 0x00, 0x0b, 0x07, 0x15, 0x03, 0x06, 0x6d, 0x65,
        0x6d, 0x6f, 0x72, 0x79, 0x02, 0x00, 0x04, 0x70, 0x69, 0x6e, 0x67, 0x00, 0x00, 0x01, 0x5f,
        0x00, 0x01, 0x0a, 0x09, 0x02, 0x04, 0x00, 0x42, 0x01, 0x0b, 0x02, 0x00, 0x0b, 0x00, 0x2b,
        0x0e, 0x63, 0x6f, 0x6e, 0x74, 0x72, 0x61, 0x63, 0x74, 0x73, 0x70, 0x65, 0x63, 0x76, 0x30,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x04, 0x70, 0x69, 0x6e,
        0x67, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x00, 0x1e,
        0x11, 0x63, 0x6f, 0x6e, 0x74, 0x72, 0x61, 0x63, 0x74, 0x65, 0x6e, 0x76, 0x6d, 0x65, 0x74,
        0x61, 0x76, 0x30, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x6f, 0x0e, 0x63, 0x6f, 0x6e, 0x74, 0x72, 0x61, 0x63, 0x74, 0x6d, 0x65, 0x74, 0x61,
        0x76, 0x30, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x05, 0x72, 0x73, 0x76, 0x65, 0x72,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x06, 0x31, 0x2e, 0x39, 0x37, 0x2e, 0x31, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x08, 0x72, 0x73, 0x73, 0x64, 0x6b, 0x76, 0x65,
        0x72, 0x00, 0x00, 0x00, 0x30, 0x32, 0x32, 0x2e, 0x30, 0x2e, 0x31, 0x31, 0x23, 0x33, 0x34,
        0x66, 0x37, 0x66, 0x35, 0x33, 0x61, 0x65, 0x33, 0x31, 0x65, 0x30, 0x66, 0x64, 0x30, 0x32,
        0x61, 0x61, 0x62, 0x34, 0x33, 0x36, 0x61, 0x39, 0x38, 0x37, 0x32, 0x65, 0x37, 0x39, 0x66,
        0x61, 0x36, 0x37, 0x31, 0x63, 0x61, 0x30, 0x32,
    ];

    #[test]
    fn test_check_version_returns_current_version() {
        let env = Env::default();
        let (client, _admin, _contract_id) = setup_client(&env);

        let v = client.check_version();
        assert_eq!(v.name, symbol_short!("escrow"));
        assert_eq!(v.semver, symbol_short!("0_1_0"));
        assert_eq!(v, client.version());
    }

    #[test]
    fn test_upgrade_requires_admin_auth() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, _admin, _contract_id) = setup_client(&env);

        let not_admin = Address::generate(&env);
        // Auth is checked before the wasm hash is ever used, so a dummy hash suffices.
        let wasm_hash = BytesN::from_array(&env, &[0u8; 32]);

        let res = client.try_upgrade(&not_admin, &wasm_hash);
        assert_eq!(res, Err(Ok(EscrowError::Unauthorized)));
        assert!(!client.is_migrated());
    }

    #[test]
    fn test_upgrade_with_admin_auth_preserves_escrow_data() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, admin, contract_id) = setup_client(&env);

        let buyer = Address::generate(&env);
        let seller = Address::generate(&env);
        let token_admin = Address::generate(&env);
        let token = env.register_stellar_asset_contract_v2(token_admin).address();
        let token_admin_client = soroban_sdk::token::StellarAssetClient::new(&env, &token);
        token_admin_client.mint(&buyer, &10000i128);
        client.add_token(&admin, &token);

        let order_id = BytesN::from_array(&env, &[3u8; 32]);
        let escrow_id = client.deposit(
            &buyer, &seller, &token, &1000i128, &order_id, &100u32, &None, &None,
        );
        let record_before = client.get_escrow(&escrow_id);
        assert!(!client.is_migrated());

        let wasm_hash = env.deployer().upload_contract_wasm(WASM_STUB);
        let upgraded = client.upgrade(&admin, &wasm_hash);
        assert!(upgraded);

        // The contract's executable now points at the stub wasm, so we read
        // storage directly rather than going through the client (whose calls
        // would now be dispatched to the stub, which implements nothing).
        let migrated: bool = env.as_contract(&contract_id, || {
            env.storage()
                .instance()
                .get(&crate::DataKey::MigrationFlag)
                .unwrap_or(false)
        });
        assert!(migrated, "migration flag must be set after upgrade");

        let record_after: crate::EscrowRecord = env.as_contract(&contract_id, || {
            env.storage()
                .persistent()
                .get(&crate::DataKey::Escrow(escrow_id))
                .unwrap()
        });
        assert_eq!(
            record_before, record_after,
            "escrow data must survive the code upgrade"
        );
    }

    // ─── Issue #327: Multi-Treasury Fee Distribution Tests ────────────────────

    #[test]
    fn test_fee_distribution_split_across_treasuries() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, admin, _contract_id) = setup_client(&env);

        let buyer = Address::generate(&env);
        let seller = Address::generate(&env);
        let token_admin = Address::generate(&env);
        let token = env.register_stellar_asset_contract_v2(token_admin).address();
        let token_admin_client = soroban_sdk::token::StellarAssetClient::new(&env, &token);
        let token_client = soroban_sdk::token::Client::new(&env, &token);
        token_admin_client.mint(&buyer, &10000i128);
        client.add_token(&admin, &token);

        let treasury_a = Address::generate(&env);
        let treasury_b = Address::generate(&env);
        let mut shares = soroban_sdk::Vec::new(&env);
        shares.push_back(crate::TreasuryShare {
            treasury: treasury_a.clone(),
            bps: 300,
        });
        shares.push_back(crate::TreasuryShare {
            treasury: treasury_b.clone(),
            bps: 200,
        });
        client.set_fee_distribution(&admin, &shares);

        let order_id = BytesN::from_array(&env, &[9u8; 32]);
        let escrow_id = client.deposit(
            &buyer, &seller, &token, &1000i128, &order_id, &100u32, &None, &None,
        );

        client.dispute(&escrow_id, &buyer);
        client.resolve_dispute(&escrow_id, &admin, &true);

        // 3% of 1000 = 30, 2% of 1000 = 20; seller receives the remaining 950.
        assert_eq!(token_client.balance(&treasury_a), 30);
        assert_eq!(token_client.balance(&treasury_b), 20);
        assert_eq!(token_client.balance(&seller), 950);
    }

    #[test]
    fn test_set_fee_distribution_rejects_over_1000_bps() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, admin, _contract_id) = setup_client(&env);

        let treasury_a = Address::generate(&env);
        let treasury_b = Address::generate(&env);
        let mut shares = soroban_sdk::Vec::new(&env);
        shares.push_back(crate::TreasuryShare {
            treasury: treasury_a,
            bps: 600,
        });
        shares.push_back(crate::TreasuryShare {
            treasury: treasury_b,
            bps: 500,
        });

        let res = client.try_set_fee_distribution(&admin, &shares);
        assert_eq!(res, Err(Ok(EscrowError::InvalidFeeBps)));
        assert_eq!(client.get_fee_distribution().len(), 0);
    }

    #[test]
    fn test_fee_uses_single_treasury_when_no_distribution_configured() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, admin, _contract_id) = setup_client(&env);
        let treasury = client.get_fee_config().treasury;

        let buyer = Address::generate(&env);
        let seller = Address::generate(&env);
        let token_admin = Address::generate(&env);
        let token = env.register_stellar_asset_contract_v2(token_admin).address();
        let token_admin_client = soroban_sdk::token::StellarAssetClient::new(&env, &token);
        let token_client = soroban_sdk::token::Client::new(&env, &token);
        token_admin_client.mint(&buyer, &10000i128);
        client.add_token(&admin, &token);

        let order_id = BytesN::from_array(&env, &[10u8; 32]);
        let escrow_id = client.deposit(
            &buyer, &seller, &token, &1000i128, &order_id, &100u32, &None, &None,
        );

        client.dispute(&escrow_id, &buyer);
        client.resolve_dispute(&escrow_id, &admin, &true);

        // fee_bps = 250 (2.5%) from setup_client -> fee = 25
        assert_eq!(token_client.balance(&treasury), 25);
        assert_eq!(token_client.balance(&seller), 975);
    }
}
