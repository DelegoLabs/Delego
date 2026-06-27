#![cfg(test)]

use crate::{PermissionsContract, PermissionsContractClient};
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
    let mut merchants = Vec::new(&t.env);
    merchants.push_back(t.seller.clone());

    client.grant(
        &t.buyer,
        &t.agent,
        &limit_total,
        &limit_per_tx,
        &merchants,
        &ttl_ledgers,
    );

    assert!(client.can_spend(&t.buyer, &t.agent, &40, &t.seller));

    client.execute_spend(&t.buyer, &t.agent, &40, &t.seller);

    assert!(client.can_spend(&t.buyer, &t.agent, &40, &t.seller));
    client.execute_spend(&t.buyer, &t.agent, &40, &t.seller);

    assert!(!client.can_spend(&t.buyer, &t.agent, &30, &t.seller));
}

#[test]
#[should_panic(expected = "Spend not authorized")]
fn test_spend_exceeds_per_tx_limit() {
    let t = TestEnv::setup();
    let client = PermissionsContractClient::new(&t.env, &t.permissions_contract_id);

    let limit_per_tx = 50i128;
    let limit_total = 100i128;
    let ttl_ledgers = 3600u32;
    let merchants = Vec::new(&t.env);

    client.grant(
        &t.buyer,
        &t.agent,
        &limit_total,
        &limit_per_tx,
        &merchants,
        &ttl_ledgers,
    );

    client.execute_spend(&t.buyer, &t.agent, &60, &t.seller);
}

#[test]
#[should_panic(expected = "Spend not authorized")]
fn test_spend_exceeds_total_limit() {
    let t = TestEnv::setup();
    let client = PermissionsContractClient::new(&t.env, &t.permissions_contract_id);

    let limit_per_tx = 50i128;
    let limit_total = 100i128;
    let ttl_ledgers = 3600u32;
    let merchants = Vec::new(&t.env);

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

    client.execute_spend(&t.buyer, &t.agent, &1, &t.seller);
}

#[test]
fn test_merchant_restriction() {
    let t = TestEnv::setup();
    let client = PermissionsContractClient::new(&t.env, &t.permissions_contract_id);

    let limit_per_tx = 100i128;
    let limit_total = 1000i128;
    let ttl_ledgers = 3600u32;

    let mut merchants = Vec::new(&t.env);
    merchants.push_back(t.seller.clone());

    client.grant(
        &t.buyer,
        &t.agent,
        &limit_total,
        &limit_per_tx,
        &merchants,
        &ttl_ledgers,
    );

    assert!(client.can_spend(&t.buyer, &t.agent, &50, &t.seller));

    let unauthorized_merchant = t.admin.clone();
    assert!(!client.can_spend(&t.buyer, &t.agent, &50, &unauthorized_merchant));
}

#[test]
fn test_permission_expiry() {
    let t = TestEnv::setup();
    let client = PermissionsContractClient::new(&t.env, &t.permissions_contract_id);

    let limit_per_tx = 100i128;
    let limit_total = 1000i128;
    let ttl_ledgers = 100u32;
    let merchants = Vec::new(&t.env);

    client.grant(
        &t.buyer,
        &t.agent,
        &limit_total,
        &limit_per_tx,
        &merchants,
        &ttl_ledgers,
    );

    assert!(client.can_spend(&t.buyer, &t.agent, &50, &t.seller));

    t.env
        .ledger()
        .set_sequence_number(t.env.ledger().sequence() + ttl_ledgers + 1);

    assert!(!client.can_spend(&t.buyer, &t.agent, &50, &t.seller));
}

#[test]
fn test_revoke_prevents_spend() {
    let t = TestEnv::setup();
    let client = PermissionsContractClient::new(&t.env, &t.permissions_contract_id);

    let limit_per_tx = 100i128;
    let limit_total = 1000i128;
    let ttl_ledgers = 3600u32;
    let merchants = Vec::new(&t.env);

    client.grant(
        &t.buyer,
        &t.agent,
        &limit_total,
        &limit_per_tx,
        &merchants,
        &ttl_ledgers,
    );

    client.revoke(&t.buyer, &t.agent);

    assert!(!client.can_spend(&t.buyer, &t.agent, &50, &t.seller));
}

#[test]
fn test_permission_events() {
    let t = TestEnv::setup();
    let client = PermissionsContractClient::new(&t.env, &t.permissions_contract_id);

    let limit_per_tx = 50i128;
    let limit_total = 100i128;
    let ttl_ledgers = 3600u32;
    let mut merchants = Vec::new(&t.env);
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
    let merchants = Vec::new(&t.env);

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
    let merchants = Vec::new(&t.env);

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
