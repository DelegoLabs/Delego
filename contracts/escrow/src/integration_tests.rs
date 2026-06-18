#![cfg(test)]

use soroban_sdk::{testutils::{Address as _, Ledger, Events}, Address, Env, TryIntoVal};
use crate::{EscrowContract, EscrowContractClient, EscrowStatus, EscrowError};

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

        let escrow_contract_id = env.register(EscrowContract, ());
        let permissions_contract_id = Address::generate(&env);

        let escrow_client = EscrowContractClient::new(&env, &escrow_contract_id);
        escrow_client.initialize(&admin);

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
fn test_full_purchase_lifecycle() {
    let t = TestEnv::setup();
    let escrow_client = EscrowContractClient::new(&t.env, &t.escrow_contract_id);
    let token_client = soroban_sdk::token::Client::new(&t.env, &t.token_contract_id);

    let amount = 1000i128;
    let timeout = 3600u64;

    // Verify initial balances
    assert_eq!(token_client.balance(&t.buyer), 10000);
    assert_eq!(token_client.balance(&t.seller), 0);
    assert_eq!(token_client.balance(&t.escrow_contract_id), 0);

    // Deposit (create escrow)
    let escrow_id = escrow_client.create_escrow(
        &t.buyer,
        &t.buyer,
        &t.permissions_contract_id,
        &t.seller,
        &t.token_contract_id,
        &amount,
        &timeout,
    );

    // Verify balances after deposit
    assert_eq!(token_client.balance(&t.buyer), 9000);
    assert_eq!(token_client.balance(&t.escrow_contract_id), 1000);

    // Release to seller
    assert!(escrow_client.release(&escrow_id, &t.buyer));

    // Verify balances after release
    assert_eq!(token_client.balance(&t.seller), 1000);
    assert_eq!(token_client.balance(&t.escrow_contract_id), 0);

    // Verify record state
    let record = escrow_client.get_escrow(&escrow_id);
    assert!(matches!(record.status, EscrowStatus::Released));
}

#[test]
fn test_full_refund_lifecycle() {
    let t = TestEnv::setup();
    let escrow_client = EscrowContractClient::new(&t.env, &t.escrow_contract_id);
    let token_client = soroban_sdk::token::Client::new(&t.env, &t.token_contract_id);

    let amount = 1000i128;
    let timeout = 3600u64;

    let escrow_id = escrow_client.create_escrow(
        &t.buyer,
        &t.buyer,
        &t.permissions_contract_id,
        &t.seller,
        &t.token_contract_id,
        &amount,
        &timeout,
    );

    // Refund called by seller
    assert!(escrow_client.refund(&escrow_id, &t.seller));

    // Verify balances after refund
    assert_eq!(token_client.balance(&t.buyer), 10000);
    assert_eq!(token_client.balance(&t.escrow_contract_id), 0);

    // Verify record state
    let record = escrow_client.get_escrow(&escrow_id);
    assert!(matches!(record.status, EscrowStatus::Refunded));
}

#[test]
fn test_dispute_resolution_to_seller() {
    let t = TestEnv::setup();
    let escrow_client = EscrowContractClient::new(&t.env, &t.escrow_contract_id);
    let token_client = soroban_sdk::token::Client::new(&t.env, &t.token_contract_id);

    let amount = 1000i128;
    let timeout = 3600u64;

    let escrow_id = escrow_client.create_escrow(
        &t.buyer,
        &t.buyer,
        &t.permissions_contract_id,
        &t.seller,
        &t.token_contract_id,
        &amount,
        &timeout,
    );

    // Dispute called by buyer
    assert!(escrow_client.dispute(&escrow_id, &t.buyer));

    // Resolve dispute to seller by admin
    assert!(escrow_client.resolve_dispute(&escrow_id, &t.admin, &true));

    // Verify balances (seller got the funds)
    assert_eq!(token_client.balance(&t.seller), 1000);
    assert_eq!(token_client.balance(&t.buyer), 9000);

    let record = escrow_client.get_escrow(&escrow_id);
    assert!(matches!(record.status, EscrowStatus::Released));
}

#[test]
fn test_dispute_resolution_to_buyer() {
    let t = TestEnv::setup();
    let escrow_client = EscrowContractClient::new(&t.env, &t.escrow_contract_id);
    let token_client = soroban_sdk::token::Client::new(&t.env, &t.token_contract_id);

    let amount = 1000i128;
    let timeout = 3600u64;

    let escrow_id = escrow_client.create_escrow(
        &t.buyer,
        &t.buyer,
        &t.permissions_contract_id,
        &t.seller,
        &t.token_contract_id,
        &amount,
        &timeout,
    );

    // Dispute called by seller
    assert!(escrow_client.dispute(&escrow_id, &t.seller));

    // Resolve dispute to buyer by admin
    assert!(escrow_client.resolve_dispute(&escrow_id, &t.admin, &false));

    // Verify balances (buyer got refunded)
    assert_eq!(token_client.balance(&t.seller), 0);
    assert_eq!(token_client.balance(&t.buyer), 10000);

    let record = escrow_client.get_escrow(&escrow_id);
    assert!(matches!(record.status, EscrowStatus::Refunded));
}

#[test]
#[should_panic]
fn test_deposit_insufficient_balance() {
    let t = TestEnv::setup();
    let escrow_client = EscrowContractClient::new(&t.env, &t.escrow_contract_id);

    // Buyer only has 10000. Try to deposit 15000.
    let amount = 15000i128;
    let timeout = 3600u64;

    escrow_client.create_escrow(
        &t.buyer,
        &t.buyer,
        &t.permissions_contract_id,
        &t.seller,
        &t.token_contract_id,
        &amount,
        &timeout,
    );
}

#[test]
fn test_release_wrong_caller() {
    let t = TestEnv::setup();
    let escrow_client = EscrowContractClient::new(&t.env, &t.escrow_contract_id);

    let amount = 1000i128;
    let timeout = 3600u64;

    let escrow_id = escrow_client.create_escrow(
        &t.buyer,
        &t.buyer,
        &t.permissions_contract_id,
        &t.seller,
        &t.token_contract_id,
        &amount,
        &timeout,
    );

    // Agent tries to release (neither buyer nor admin)
    let res = escrow_client.try_release(&escrow_id, &t.agent);
    assert_eq!(res, Err(Ok(EscrowError::Unauthorized)));
}

#[test]
fn test_double_release_prevention() {
    let t = TestEnv::setup();
    let escrow_client = EscrowContractClient::new(&t.env, &t.escrow_contract_id);

    let amount = 1000i128;
    let timeout = 3600u64;

    let escrow_id = escrow_client.create_escrow(
        &t.buyer,
        &t.buyer,
        &t.permissions_contract_id,
        &t.seller,
        &t.token_contract_id,
        &amount,
        &timeout,
    );

    // Release once
    assert!(escrow_client.release(&escrow_id, &t.buyer));

    // Release twice
    let res = escrow_client.try_release(&escrow_id, &t.buyer);
    assert_eq!(res, Err(Ok(EscrowError::AlreadyReleased)));
}

#[test]
fn test_refund_before_timeout_fails() {
    let t = TestEnv::setup();
    let escrow_client = EscrowContractClient::new(&t.env, &t.escrow_contract_id);

    let amount = 1000i128;
    let timeout = 3600u64;

    let escrow_id = escrow_client.create_escrow(
        &t.buyer,
        &t.buyer,
        &t.permissions_contract_id,
        &t.seller,
        &t.token_contract_id,
        &amount,
        &timeout,
    );

    // Try to refund as buyer before timeout (should return TimeoutNotReached)
    let res = escrow_client.try_refund(&escrow_id, &t.buyer);
    assert_eq!(res, Err(Ok(EscrowError::TimeoutNotReached)));
}

#[test]
fn test_timeout_auto_refund() {
    let t = TestEnv::setup();
    let escrow_client = EscrowContractClient::new(&t.env, &t.escrow_contract_id);
    let token_client = soroban_sdk::token::Client::new(&t.env, &t.token_contract_id);

    let amount = 1000i128;
    let timeout = 3600u64;

    let escrow_id = escrow_client.create_escrow(
        &t.buyer,
        &t.buyer,
        &t.permissions_contract_id,
        &t.seller,
        &t.token_contract_id,
        &amount,
        &timeout,
    );

    // Advance ledger past timeout
    t.env.ledger().set_timestamp(t.env.ledger().timestamp() + timeout + 1);

    // Now refund should succeed
    assert!(escrow_client.refund(&escrow_id, &t.buyer));
    assert_eq!(token_client.balance(&t.buyer), 10000);
}

#[test]
fn test_escrow_events() {
    let t = TestEnv::setup();
    let escrow_client = EscrowContractClient::new(&t.env, &t.escrow_contract_id);

    let amount = 1000i128;
    let timeout = 3600u64;

    // 1. Test EscrowCreatedEvent
    let escrow_id = escrow_client.create_escrow(
        &t.buyer,
        &t.buyer,
        &t.permissions_contract_id,
        &t.seller,
        &t.token_contract_id,
        &amount,
        &timeout,
    );

    let events = t.env.events().all();
    let mut created_event_found = false;
    for event in events.iter() {
        let (contract, topics, value) = event;
        if contract == t.escrow_contract_id {
            if topics.len() == 2 {
                let topic0: soroban_sdk::Symbol = topics.get(0).unwrap().try_into_val(&t.env).unwrap();
                let topic1: soroban_sdk::Symbol = topics.get(1).unwrap().try_into_val(&t.env).unwrap();
                if topic0 == soroban_sdk::symbol_short!("escrow") && topic1 == soroban_sdk::symbol_short!("created") {
                    let evt: crate::EscrowCreatedEvent = value.try_into_val(&t.env).unwrap();
                    assert_eq!(evt.escrow_id, escrow_id);
                    assert_eq!(evt.buyer, t.buyer);
                    assert_eq!(evt.seller, t.seller);
                    assert_eq!(evt.token, t.token_contract_id);
                    assert_eq!(evt.amount, amount);
                    created_event_found = true;
                }
            }
        }
    }
    assert!(created_event_found);

    // 2. Test EscrowReleasedEvent
    escrow_client.release(&escrow_id, &t.buyer);
    let events = t.env.events().all();
    let mut released_event_found = false;
    for event in events.iter() {
        let (contract, topics, value) = event;
        if contract == t.escrow_contract_id {
            if topics.len() == 2 {
                let topic0: soroban_sdk::Symbol = topics.get(0).unwrap().try_into_val(&t.env).unwrap();
                let topic1: soroban_sdk::Symbol = topics.get(1).unwrap().try_into_val(&t.env).unwrap();
                if topic0 == soroban_sdk::symbol_short!("escrow") && topic1 == soroban_sdk::symbol_short!("released") {
                    let evt: crate::EscrowReleasedEvent = value.try_into_val(&t.env).unwrap();
                    assert_eq!(evt.escrow_id, escrow_id);
                    assert_eq!(evt.seller, t.seller);
                    assert_eq!(evt.amount, amount);
                    assert_eq!(evt.released_by, t.buyer);
                    released_event_found = true;
                }
            }
        }
    }
    assert!(released_event_found);

    // 3. Test EscrowRefundedEvent
    let escrow_id2 = escrow_client.create_escrow(
        &t.buyer,
        &t.buyer,
        &t.permissions_contract_id,
        &t.seller,
        &t.token_contract_id,
        &amount,
        &timeout,
    );
    escrow_client.refund(&escrow_id2, &t.seller);
    let events = t.env.events().all();
    let mut refunded_event_found = false;
    for event in events.iter() {
        let (contract, topics, value) = event;
        if contract == t.escrow_contract_id {
            if topics.len() == 2 {
                let topic0: soroban_sdk::Symbol = topics.get(0).unwrap().try_into_val(&t.env).unwrap();
                let topic1: soroban_sdk::Symbol = topics.get(1).unwrap().try_into_val(&t.env).unwrap();
                if topic0 == soroban_sdk::symbol_short!("escrow") && topic1 == soroban_sdk::symbol_short!("refunded") {
                    let evt: crate::EscrowRefundedEvent = value.try_into_val(&t.env).unwrap();
                    assert_eq!(evt.escrow_id, escrow_id2);
                    assert_eq!(evt.buyer, t.buyer);
                    assert_eq!(evt.amount, amount);
                    assert_eq!(evt.refunded_by, t.seller);
                    refunded_event_found = true;
                }
            }
        }
    }
    assert!(refunded_event_found);

    // 4. Test EscrowDisputedEvent and EscrowResolvedEvent
    let escrow_id3 = escrow_client.create_escrow(
        &t.buyer,
        &t.buyer,
        &t.permissions_contract_id,
        &t.seller,
        &t.token_contract_id,
        &amount,
        &timeout,
    );
    escrow_client.dispute(&escrow_id3, &t.buyer);
    let events = t.env.events().all();
    let mut disputed_event_found = false;
    for event in events.iter() {
        let (contract, topics, value) = event;
        if contract == t.escrow_contract_id {
            if topics.len() == 2 {
                let topic0: soroban_sdk::Symbol = topics.get(0).unwrap().try_into_val(&t.env).unwrap();
                let topic1: soroban_sdk::Symbol = topics.get(1).unwrap().try_into_val(&t.env).unwrap();
                if topic0 == soroban_sdk::symbol_short!("escrow") && topic1 == soroban_sdk::symbol_short!("disputed") {
                    let evt: crate::EscrowDisputedEvent = value.try_into_val(&t.env).unwrap();
                    assert_eq!(evt.escrow_id, escrow_id3);
                    assert_eq!(evt.disputed_by, t.buyer);
                    disputed_event_found = true;
                }
            }
        }
    }
    assert!(disputed_event_found);

    escrow_client.resolve_dispute(&escrow_id3, &t.admin, &true);
    let events = t.env.events().all();
    let mut resolved_event_found = false;
    for event in events.iter() {
        let (contract, topics, value) = event;
        if contract == t.escrow_contract_id {
            if topics.len() == 2 {
                let topic0: soroban_sdk::Symbol = topics.get(0).unwrap().try_into_val(&t.env).unwrap();
                let topic1: soroban_sdk::Symbol = topics.get(1).unwrap().try_into_val(&t.env).unwrap();
                if topic0 == soroban_sdk::symbol_short!("escrow") && topic1 == soroban_sdk::symbol_short!("resolved") {
                    let evt: crate::EscrowResolvedEvent = value.try_into_val(&t.env).unwrap();
                    assert_eq!(evt.escrow_id, escrow_id3);
                    assert_eq!(evt.release_to_seller, true);
                    assert_eq!(evt.resolved_by, t.admin);
                    resolved_event_found = true;
                }
            }
        }
    }
    assert!(resolved_event_found);
}

