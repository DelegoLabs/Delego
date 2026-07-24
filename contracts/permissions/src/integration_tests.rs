#![cfg(test)]

use crate::{PermissionError, PermissionsContract, PermissionsContractClient};
use soroban_sdk::{
    testutils::{Address as _, Events, Ledger},
    Address, Env, TryIntoVal, Vec,
};

struct TestEnv {
    env: Env,
    admin: Address,
    buyer: Address,
    seller: Address,
    agent: Address,
    _token_contract_id: Address,
    _token_admin: Address,
    _escrow_contract_id: Address,
    permissions_contract_id: Address,
}

impl TestEnv {
    fn setup() -> Self {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let buyer = Address::generate(&env);
        let seller = Address::generate(&env);
        let agent = Address::generate(&env);

        let token_admin = Address::generate(&env);
        #[allow(deprecated)]
        let token_contract_id = env.register_stellar_asset_contract(token_admin.clone());
        let token_admin_client =
            soroban_sdk::token::StellarAssetClient::new(&env, &token_contract_id);
        token_admin_client.mint(&buyer, &10000);

        let escrow_contract_id = Address::generate(&env);
        let permissions_contract_id = env.register(PermissionsContract, ());

        TestEnv {
            env,
            admin,
            buyer,
            seller,
            agent,
            _token_contract_id: token_contract_id,
            _token_admin: token_admin,
            _escrow_contract_id: escrow_contract_id,
            permissions_contract_id,
        }
    }
}

#[test]
fn test_grant_and_spend() {
    let t = TestEnv::setup();
    let client = PermissionsContractClient::new(&t.env, &t.permissions_contract_id);

    let limit_per_tx = 50i128;
    let limit_total = 100i128;
    let ttl_ledgers = 3600u32;
    let mut merchants = Vec::<soroban_sdk::Address>::new(&t.env);
    merchants.push_back(t.seller.clone());

    client.grant(
        &t.buyer,
        &t.agent,
        &limit_total,
        &limit_per_tx,
        &merchants,
        &ttl_ledgers,
    );

    assert_eq!(
        client.try_can_spend(&t.buyer, &t.agent, &40, &t.seller),
        Ok(Ok(()))
    );

    client.execute_spend(&t.buyer, &t.agent, &40, &t.seller);

    assert_eq!(
        client.try_can_spend(&t.buyer, &t.agent, &40, &t.seller),
        Ok(Ok(()))
    );
    client.execute_spend(&t.buyer, &t.agent, &40, &t.seller);

    // Only 20 of the 100 total allowance remains, so a 30 spend is over the total limit.
    assert_eq!(
        client.try_can_spend(&t.buyer, &t.agent, &30, &t.seller),
        Err(Ok(PermissionError::ExceedsTotalLimit))
    );
}

#[test]
fn test_spend_exceeds_per_tx_limit() {
    let t = TestEnv::setup();
    let client = PermissionsContractClient::new(&t.env, &t.permissions_contract_id);

    let limit_per_tx = 50i128;
    let limit_total = 100i128;
    let ttl_ledgers = 3600u32;
    let merchants = Vec::<soroban_sdk::Address>::new(&t.env);

    client.grant(
        &t.buyer,
        &t.agent,
        &limit_total,
        &limit_per_tx,
        &merchants,
        &ttl_ledgers,
    );

    assert_eq!(
        client.try_execute_spend(&t.buyer, &t.agent, &60, &t.seller),
        Err(Ok(PermissionError::ExceedsPerTxLimit))
    );
}

#[test]
fn test_spend_exceeds_total_limit() {
    let t = TestEnv::setup();
    let client = PermissionsContractClient::new(&t.env, &t.permissions_contract_id);

    let limit_per_tx = 50i128;
    let limit_total = 100i128;
    let ttl_ledgers = 3600u32;
    let merchants = Vec::<soroban_sdk::Address>::new(&t.env);

    client.grant(
        &t.buyer,
        &t.agent,
        &limit_total,
        &limit_per_tx,
        &merchants,
        &ttl_ledgers,
    );

    client.execute_spend(&t.buyer, &t.agent, &50, &t.seller);
    client.execute_spend(&t.buyer, &t.agent, &50, &t.seller);

    assert_eq!(
        client.try_execute_spend(&t.buyer, &t.agent, &1, &t.seller),
        Err(Ok(PermissionError::ExceedsTotalLimit))
    );
}

#[test]
fn test_merchant_restriction() {
    let t = TestEnv::setup();
    let client = PermissionsContractClient::new(&t.env, &t.permissions_contract_id);

    let limit_per_tx = 100i128;
    let limit_total = 1000i128;
    let ttl_ledgers = 3600u32;

    let mut merchants = Vec::<soroban_sdk::Address>::new(&t.env);
    merchants.push_back(t.seller.clone());

    client.grant(
        &t.buyer,
        &t.agent,
        &limit_total,
        &limit_per_tx,
        &merchants,
        &ttl_ledgers,
    );

    assert_eq!(
        client.try_can_spend(&t.buyer, &t.agent, &50, &t.seller),
        Ok(Ok(()))
    );

    let unauthorized_merchant = t.admin.clone();
    assert_eq!(
        client.try_can_spend(&t.buyer, &t.agent, &50, &unauthorized_merchant),
        Err(Ok(PermissionError::MerchantNotAllowed))
    );
}

#[test]
fn test_permission_expiry() {
    let t = TestEnv::setup();
    let client = PermissionsContractClient::new(&t.env, &t.permissions_contract_id);

    let limit_per_tx = 100i128;
    let limit_total = 1000i128;
    let ttl_ledgers = 100u32;
    let merchants = Vec::<soroban_sdk::Address>::new(&t.env);

    client.grant(
        &t.buyer,
        &t.agent,
        &limit_total,
        &limit_per_tx,
        &merchants,
        &ttl_ledgers,
    );

    assert_eq!(
        client.try_can_spend(&t.buyer, &t.agent, &50, &t.seller),
        Ok(Ok(()))
    );

    t.env
        .ledger()
        .set_sequence_number(t.env.ledger().sequence() + ttl_ledgers + 1);

    assert_eq!(
        client.try_can_spend(&t.buyer, &t.agent, &50, &t.seller),
        Err(Ok(PermissionError::Expired))
    );
}

#[test]
fn test_revoke_prevents_spend() {
    let t = TestEnv::setup();
    let client = PermissionsContractClient::new(&t.env, &t.permissions_contract_id);

    let limit_per_tx = 100i128;
    let limit_total = 1000i128;
    let ttl_ledgers = 3600u32;
    let merchants = Vec::<soroban_sdk::Address>::new(&t.env);

    client.grant(
        &t.buyer,
        &t.agent,
        &limit_total,
        &limit_per_tx,
        &merchants,
        &ttl_ledgers,
    );

    client.revoke(&t.buyer, &t.agent);

    assert_eq!(
        client.try_can_spend(&t.buyer, &t.agent, &50, &t.seller),
        Err(Ok(PermissionError::Unauthorized))
    );
}

#[test]
fn test_permission_events() {
    let t = TestEnv::setup();
    let client = PermissionsContractClient::new(&t.env, &t.permissions_contract_id);

    let limit_per_tx = 50i128;
    let limit_total = 100i128;
    let ttl_ledgers = 3600u32;
    let mut merchants = Vec::<soroban_sdk::Address>::new(&t.env);
    merchants.push_back(t.seller.clone());

    client.grant(
        &t.buyer,
        &t.agent,
        &limit_total,
        &limit_per_tx,
        &merchants,
        &ttl_ledgers,
    );
    let events = t.env.events().all();
    let mut granted_event_found = false;
    for event in events.iter() {
        let (contract, topics, value) = event;
        if contract == t.permissions_contract_id {
            if topics.len() == 2 {
                let topic0: soroban_sdk::Symbol =
                    topics.get(0).unwrap().try_into_val(&t.env).unwrap();
                let topic1: soroban_sdk::Symbol =
                    topics.get(1).unwrap().try_into_val(&t.env).unwrap();
                if topic0 == soroban_sdk::symbol_short!("perm")
                    && topic1 == soroban_sdk::symbol_short!("granted")
                {
                    let evt: crate::PermissionGrantedEvent = value.try_into_val(&t.env).unwrap();
                    assert_eq!(evt.owner, t.buyer);
                    assert_eq!(evt.delegate, t.agent);
                    assert_eq!(evt.per_tx_limit, limit_per_tx);
                    assert_eq!(evt.total_limit, limit_total);
                    assert_eq!(
                        evt.expires_at_ledger,
                        t.env.ledger().sequence() + ttl_ledgers
                    );
                    assert_eq!(evt.merchant_count, 1);
                    granted_event_found = true;
                }
            }
        }
    }
    assert!(granted_event_found);

    client.execute_spend(&t.buyer, &t.agent, &40, &t.seller);
    let events = t.env.events().all();
    let mut spent_event_found = false;
    for event in events.iter() {
        let (contract, topics, value) = event;
        if contract == t.permissions_contract_id {
            if topics.len() == 2 {
                let topic0: soroban_sdk::Symbol =
                    topics.get(0).unwrap().try_into_val(&t.env).unwrap();
                let topic1: soroban_sdk::Symbol =
                    topics.get(1).unwrap().try_into_val(&t.env).unwrap();
                if topic0 == soroban_sdk::symbol_short!("perm")
                    && topic1 == soroban_sdk::symbol_short!("spent")
                {
                    let evt: crate::PermissionSpendEvent = value.try_into_val(&t.env).unwrap();
                    assert_eq!(evt.owner, t.buyer);
                    assert_eq!(evt.delegate, t.agent);
                    assert_eq!(evt.amount, 40);
                    assert_eq!(evt.merchant, t.seller);
                    assert_eq!(evt.remaining, 60);
                    spent_event_found = true;
                }
            }
        }
    }
    assert!(spent_event_found);

    client.revoke(&t.buyer, &t.agent);
    let events = t.env.events().all();
    let mut revoked_event_found = false;
    for event in events.iter() {
        let (contract, topics, value) = event;
        if contract == t.permissions_contract_id {
            if topics.len() == 2 {
                let topic0: soroban_sdk::Symbol =
                    topics.get(0).unwrap().try_into_val(&t.env).unwrap();
                let topic1: soroban_sdk::Symbol =
                    topics.get(1).unwrap().try_into_val(&t.env).unwrap();
                if topic0 == soroban_sdk::symbol_short!("perm")
                    && topic1 == soroban_sdk::symbol_short!("revoked")
                {
                    let evt: crate::PermissionRevokedEvent = value.try_into_val(&t.env).unwrap();
                    assert_eq!(evt.owner, t.buyer);
                    assert_eq!(evt.delegate, t.agent);
                    revoked_event_found = true;
                }
            }
        }
    }
    assert!(revoked_event_found);
}

#[test]
fn test_decrease_allowance_timelock() {
    let t = TestEnv::setup();
    let client = PermissionsContractClient::new(&t.env, &t.permissions_contract_id);

    let limit_per_tx = 100i128;
    let limit_total = 1000i128;
    let ttl_ledgers = 36000u32;
    let merchants = Vec::<soroban_sdk::Address>::new(&t.env);

    client.grant(
        &t.buyer,
        &t.agent,
        &limit_total,
        &limit_per_tx,
        &merchants,
        &ttl_ledgers,
    );

    assert!(client.decrease_allowance(&t.buyer, &t.agent, &200));

    // Advance past the 24h timelock (86400 seconds)
    t.env
        .ledger()
        .set_timestamp(t.env.ledger().timestamp() + 86401);

    assert!(client.execute_decrease_allowance(&t.buyer, &t.agent));

    // Verify allowance was decreased
    assert_eq!(client.get_remaining_allowance(&t.buyer, &t.agent), 800);
}

#[test]
#[should_panic(expected = "Time-lock has not elapsed yet")]
fn test_decrease_allowance_timelock_blocked() {
    let t = TestEnv::setup();
    let client = PermissionsContractClient::new(&t.env, &t.permissions_contract_id);

    let limit_per_tx = 100i128;
    let limit_total = 1000i128;
    let ttl_ledgers = 36000u32;
    let merchants = Vec::<soroban_sdk::Address>::new(&t.env);

    client.grant(
        &t.buyer,
        &t.agent,
        &limit_total,
        &limit_per_tx,
        &merchants,
        &ttl_ledgers,
    );

    assert!(client.decrease_allowance(&t.buyer, &t.agent, &200));

    // Jump time but not enough (24h = 86400 seconds)
    t.env
        .ledger()
        .set_timestamp(t.env.ledger().timestamp() + 86399);

    client.execute_decrease_allowance(&t.buyer, &t.agent);
}

// ── Issue #338: Time-based inactivity auto-revocation tests ─────────────

#[test]
fn test_set_inactivity_threshold_admin_configures() {
    let t = TestEnv::setup();
    let client = PermissionsContractClient::new(&t.env, &t.permissions_contract_id);
    client.set_admin(&t.admin);

    assert_eq!(client.get_inactivity_threshold(), 0);

    client.set_inactivity_threshold(&t.admin, &604800u64);

    assert_eq!(client.get_inactivity_threshold(), 604800u64);
}

#[test]
fn test_set_inactivity_threshold_non_admin_fails() {
    let t = TestEnv::setup();
    let client = PermissionsContractClient::new(&t.env, &t.permissions_contract_id);
    client.set_admin(&t.admin);

    let non_admin = Address::generate(&t.env);
    assert_eq!(
        client.try_set_inactivity_threshold(&non_admin, &604800u64),
        Err(Ok(PermissionError::Unauthorized))
    );
}

#[test]
fn test_sweep_inactive_revokes_after_threshold() {
    let t = TestEnv::setup();
    let client = PermissionsContractClient::new(&t.env, &t.permissions_contract_id);
    client.set_admin(&t.admin);
    client.set_inactivity_threshold(&t.admin, &604800u64); // 7 days

    let merchants = Vec::<Address>::new(&t.env);
    client.grant(&t.buyer, &t.agent, &1000, &100, &merchants, &36000);

    t.env
        .ledger()
        .set_timestamp(t.env.ledger().timestamp() + 604801);

    let revoked = client.sweep_inactive(&t.buyer, &t.agent, &t.seller);
    assert!(revoked);

    let record = client.get_permission(&t.buyer, &t.agent);
    assert_eq!(record.status, crate::PermissionStatus::Revoked);
}

#[test]
fn test_sweep_inactive_does_not_affect_permission_with_spend() {
    let t = TestEnv::setup();
    let client = PermissionsContractClient::new(&t.env, &t.permissions_contract_id);
    client.set_admin(&t.admin);
    client.set_inactivity_threshold(&t.admin, &604800u64);

    let merchant = Address::generate(&t.env);
    let mut merchants = Vec::<Address>::new(&t.env);
    merchants.push_back(merchant.clone());
    client.grant(&t.buyer, &t.agent, &1000, &100, &merchants, &36000);

    client.execute_spend(&t.buyer, &t.agent, &50, &merchant);

    t.env
        .ledger()
        .set_timestamp(t.env.ledger().timestamp() + 604801);

    let revoked = client.sweep_inactive(&t.buyer, &t.agent, &t.seller);
    assert!(!revoked);

    let record = client.get_permission(&t.buyer, &t.agent);
    assert_eq!(record.status, crate::PermissionStatus::Active);
}

#[test]
fn test_sweep_inactive_before_threshold_not_revoked() {
    let t = TestEnv::setup();
    let client = PermissionsContractClient::new(&t.env, &t.permissions_contract_id);
    client.set_admin(&t.admin);
    client.set_inactivity_threshold(&t.admin, &604800u64);

    let merchants = Vec::<Address>::new(&t.env);
    client.grant(&t.buyer, &t.agent, &1000, &100, &merchants, &36000);

    // Only 1 day elapsed, threshold is 7 days.
    t.env.ledger().set_timestamp(t.env.ledger().timestamp() + 86400);

    let revoked = client.sweep_inactive(&t.buyer, &t.agent, &t.seller);
    assert!(!revoked);

    let record = client.get_permission(&t.buyer, &t.agent);
    assert_eq!(record.status, crate::PermissionStatus::Active);
}

#[test]
fn test_sweep_inactive_without_configured_threshold_fails() {
    let t = TestEnv::setup();
    let client = PermissionsContractClient::new(&t.env, &t.permissions_contract_id);

    let merchants = Vec::<Address>::new(&t.env);
    client.grant(&t.buyer, &t.agent, &1000, &100, &merchants, &36000);

    assert_eq!(
        client.try_sweep_inactive(&t.buyer, &t.agent, &t.seller),
        Err(Ok(PermissionError::InactivityThresholdNotSet))
    );
}

// ── Issue #359: Immutable permission audit log tests ─────────────────────

#[test]
fn test_audit_log_records_state_transitions() {
    let t = TestEnv::setup();
    let client = PermissionsContractClient::new(&t.env, &t.permissions_contract_id);

    let merchants = Vec::<Address>::new(&t.env);
    client.grant(&t.buyer, &t.agent, &1000, &100, &merchants, &36000);
    client.pause(&t.buyer, &t.agent);
    client.resume(&t.buyer, &t.agent);
    client.revoke(&t.buyer, &t.agent);

    let log = client.get_audit_log(&t.buyer, &t.agent);
    assert_eq!(log.len(), 4);

    assert_eq!(log.get(0).unwrap().action, soroban_sdk::symbol_short!("granted"));
    assert_eq!(log.get(1).unwrap().action, soroban_sdk::symbol_short!("paused"));
    assert_eq!(log.get(2).unwrap().action, soroban_sdk::symbol_short!("resumed"));
    assert_eq!(log.get(3).unwrap().action, soroban_sdk::symbol_short!("revoked"));

    for entry in log.iter() {
        assert_eq!(entry.actor, t.buyer);
    }
}

#[test]
fn test_audit_log_empty_for_unknown_pair() {
    let t = TestEnv::setup();
    let client = PermissionsContractClient::new(&t.env, &t.permissions_contract_id);

    let log = client.get_audit_log(&t.buyer, &t.agent);
    assert_eq!(log.len(), 0);
}

#[test]
fn test_audit_log_records_auto_revocation() {
    let t = TestEnv::setup();
    let client = PermissionsContractClient::new(&t.env, &t.permissions_contract_id);
    client.set_admin(&t.admin);
    client.set_inactivity_threshold(&t.admin, &604800u64);

    let merchants = Vec::<Address>::new(&t.env);
    client.grant(&t.buyer, &t.agent, &1000, &100, &merchants, &36000);

    t.env
        .ledger()
        .set_timestamp(t.env.ledger().timestamp() + 604801);
    client.sweep_inactive(&t.buyer, &t.agent, &t.seller);

    let log = client.get_audit_log(&t.buyer, &t.agent);
    assert_eq!(log.len(), 2);
    assert_eq!(log.get(0).unwrap().action, soroban_sdk::symbol_short!("granted"));
    assert_eq!(log.get(1).unwrap().action, soroban_sdk::symbol_short!("autorevk"));
    assert_eq!(log.get(1).unwrap().actor, t.seller);
}
