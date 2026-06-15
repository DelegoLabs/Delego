#![cfg(test)]

use soroban_sdk::{testutils::{Address as _, Ledger, Events}, Address, Env, Vec, TryIntoVal};
use crate::{PermissionsContract, PermissionsContractClient};

struct TestEnv {
    env: Env,
    admin: Address,
    buyer: Address,
    seller: Address,
    agent: Address,
    token_contract_id: Address,
    token_admin: Address,
    escrow_contract_id: Address,
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
        let token_contract_id = env.register_stellar_asset_contract(token_admin.clone());
        let token_admin_client = soroban_sdk::token::StellarAssetClient::new(&env, &token_contract_id);
        token_admin_client.mint(&buyer, &10000);

        let escrow_contract_id = Address::generate(&env);
        let permissions_contract_id = env.register(PermissionsContract, ());

        TestEnv {
            env,
            admin,
            buyer,
            seller,
            agent,
            token_contract_id,
            token_admin,
            escrow_contract_id,
            permissions_contract_id,
        }
    }
}

#[test]
fn test_grant_and_spend() {
    let t = TestEnv::setup();
    let client = PermissionsContractClient::new(&t.env, &t.permissions_contract_id);

    let per_tx_limit = 50i128;
    let total_limit = 100i128;
    let expiry = t.env.ledger().timestamp() + 3600;
    let mut merchants = Vec::new(&t.env);
    merchants.push_back(t.seller.clone());

    // Grant permission
    assert!(client.grant(&t.buyer, &t.agent, &per_tx_limit, &total_limit, &expiry, &merchants));

    // Check can spend
    assert!(client.can_spend(&t.buyer, &t.agent, &40, &t.seller));

    // Spend and verify allowance decrements
    assert!(client.execute_spend(&t.buyer, &t.agent, &40, &t.seller));
    
    // Remaining total limit should be 60. Spending 40 again should fail
    assert!(client.can_spend(&t.buyer, &t.agent, &40, &t.seller));
    assert!(client.execute_spend(&t.buyer, &t.agent, &40, &t.seller));

    // Now remaining is 20. Spending 30 should fail can_spend
    assert!(!client.can_spend(&t.buyer, &t.agent, &30, &t.seller));
}

#[test]
#[should_panic(expected = "Spend not authorized")]
fn test_spend_exceeds_per_tx_limit() {
    let t = TestEnv::setup();
    let client = PermissionsContractClient::new(&t.env, &t.permissions_contract_id);

    let per_tx_limit = 50i128;
    let total_limit = 100i128;
    let expiry = t.env.ledger().timestamp() + 3600;
    let merchants = Vec::new(&t.env);

    client.grant(&t.buyer, &t.agent, &per_tx_limit, &total_limit, &expiry, &merchants);
    
    // Try to spend 60 (exceeds per_tx_limit of 50)
    client.execute_spend(&t.buyer, &t.agent, &60, &t.seller);
}

#[test]
#[should_panic(expected = "Spend not authorized")]
fn test_spend_exceeds_total_limit() {
    let t = TestEnv::setup();
    let client = PermissionsContractClient::new(&t.env, &t.permissions_contract_id);

    let per_tx_limit = 50i128;
    let total_limit = 100i128;
    let expiry = t.env.ledger().timestamp() + 3600;
    let merchants = Vec::new(&t.env);

    client.grant(&t.buyer, &t.agent, &per_tx_limit, &total_limit, &expiry, &merchants);

    // Spend 50 twice (reaches total limit of 100)
    client.execute_spend(&t.buyer, &t.agent, &50, &t.seller);
    client.execute_spend(&t.buyer, &t.agent, &50, &t.seller);

    // Attempt to spend 1 more
    client.execute_spend(&t.buyer, &t.agent, &1, &t.seller);
}

#[test]
fn test_merchant_restriction() {
    let t = TestEnv::setup();
    let client = PermissionsContractClient::new(&t.env, &t.permissions_contract_id);

    let per_tx_limit = 100i128;
    let total_limit = 1000i128;
    let expiry = t.env.ledger().timestamp() + 3600;
    
    let mut merchants = Vec::new(&t.env);
    merchants.push_back(t.seller.clone());

    client.grant(&t.buyer, &t.agent, &per_tx_limit, &total_limit, &expiry, &merchants);

    // Spend at authorized merchant
    assert!(client.can_spend(&t.buyer, &t.agent, &50, &t.seller));

    // Spend at unauthorized merchant (admin)
    let unauthorized_merchant = t.admin.clone();
    assert!(!client.can_spend(&t.buyer, &t.agent, &50, &unauthorized_merchant));
}

#[test]
fn test_permission_expiry() {
    let t = TestEnv::setup();
    let client = PermissionsContractClient::new(&t.env, &t.permissions_contract_id);

    let per_tx_limit = 100i128;
    let total_limit = 1000i128;
    let expiry = t.env.ledger().timestamp() + 100;
    let merchants = Vec::new(&t.env);

    client.grant(&t.buyer, &t.agent, &per_tx_limit, &total_limit, &expiry, &merchants);

    // Check can spend before expiry
    assert!(client.can_spend(&t.buyer, &t.agent, &50, &t.seller));

    // Advance ledger past expiry
    t.env.ledger().set_timestamp(expiry + 1);

    // Verify cannot spend
    assert!(!client.can_spend(&t.buyer, &t.agent, &50, &t.seller));
}

#[test]
fn test_revoke_prevents_spend() {
    let t = TestEnv::setup();
    let client = PermissionsContractClient::new(&t.env, &t.permissions_contract_id);

    let per_tx_limit = 100i128;
    let total_limit = 1000i128;
    let expiry = t.env.ledger().timestamp() + 3600;
    let merchants = Vec::new(&t.env);

    client.grant(&t.buyer, &t.agent, &per_tx_limit, &total_limit, &expiry, &merchants);

    // Revoke
    assert!(client.revoke(&t.buyer, &t.agent));

    // Try to spend
    assert!(!client.can_spend(&t.buyer, &t.agent, &50, &t.seller));
}

#[test]
fn test_permission_events() {
    let t = TestEnv::setup();
    let client = PermissionsContractClient::new(&t.env, &t.permissions_contract_id);

    let per_tx_limit = 50i128;
    let total_limit = 100i128;
    let expiry = t.env.ledger().timestamp() + 3600;
    let mut merchants = Vec::new(&t.env);
    merchants.push_back(t.seller.clone());

    // 1. Test PermissionGrantedEvent
    assert!(client.grant(&t.buyer, &t.agent, &per_tx_limit, &total_limit, &expiry, &merchants));
    let events = t.env.events().all();
    let mut granted_event_found = false;
    for event in events.iter() {
        let (contract, topics, value) = event;
        if contract == t.permissions_contract_id {
            if topics.len() == 2 {
                let topic0: soroban_sdk::Symbol = topics.get(0).unwrap().try_into_val(&t.env).unwrap();
                let topic1: soroban_sdk::Symbol = topics.get(1).unwrap().try_into_val(&t.env).unwrap();
                if topic0 == soroban_sdk::symbol_short!("perm") && topic1 == soroban_sdk::symbol_short!("granted") {
                    let evt: crate::PermissionGrantedEvent = value.try_into_val(&t.env).unwrap();
                    assert_eq!(evt.owner, t.buyer);
                    assert_eq!(evt.delegate, t.agent);
                    assert_eq!(evt.per_tx_limit, per_tx_limit);
                    assert_eq!(evt.total_limit, total_limit);
                    assert_eq!(evt.expiry_timestamp, expiry);
                    assert_eq!(evt.merchant_count, 1);
                    granted_event_found = true;
                }
            }
        }
    }
    assert!(granted_event_found);

    // 2. Test SpendExecutedEvent
    assert!(client.execute_spend(&t.buyer, &t.agent, &40, &t.seller));
    let events = t.env.events().all();
    let mut spent_event_found = false;
    for event in events.iter() {
        let (contract, topics, value) = event;
        if contract == t.permissions_contract_id {
            if topics.len() == 2 {
                let topic0: soroban_sdk::Symbol = topics.get(0).unwrap().try_into_val(&t.env).unwrap();
                let topic1: soroban_sdk::Symbol = topics.get(1).unwrap().try_into_val(&t.env).unwrap();
                if topic0 == soroban_sdk::symbol_short!("perm") && topic1 == soroban_sdk::symbol_short!("spent") {
                    let evt: crate::SpendExecutedEvent = value.try_into_val(&t.env).unwrap();
                    assert_eq!(evt.owner, t.buyer);
                    assert_eq!(evt.delegate, t.agent);
                    assert_eq!(evt.amount, 40);
                    assert_eq!(evt.merchant, t.seller);
                    assert_eq!(evt.remaining_allowance, 60);
                    spent_event_found = true;
                }
            }
        }
    }
    assert!(spent_event_found);

    // 3. Test PermissionRevokedEvent
    assert!(client.revoke(&t.buyer, &t.agent));
    let events = t.env.events().all();
    let mut revoked_event_found = false;
    for event in events.iter() {
        let (contract, topics, value) = event;
        if contract == t.permissions_contract_id {
            if topics.len() == 2 {
                let topic0: soroban_sdk::Symbol = topics.get(0).unwrap().try_into_val(&t.env).unwrap();
                let topic1: soroban_sdk::Symbol = topics.get(1).unwrap().try_into_val(&t.env).unwrap();
                if topic0 == soroban_sdk::symbol_short!("perm") && topic1 == soroban_sdk::symbol_short!("revoked") {
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
