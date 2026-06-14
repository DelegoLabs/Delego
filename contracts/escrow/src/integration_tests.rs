#![cfg(test)]

use soroban_sdk::{testutils::{Address as _, Ledger}, Address, Env};
use crate::{EscrowContract, EscrowContractClient, EscrowStatus};

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
#[should_panic(expected = "Unauthorized to release escrow")]
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
    escrow_client.release(&escrow_id, &t.agent);
}

#[test]
#[should_panic(expected = "Escrow already released")]
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
    escrow_client.release(&escrow_id, &t.buyer);
}

#[test]
#[should_panic(expected = "Cannot refund before timeout")]
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

    // Try to refund as buyer before timeout (should panic)
    escrow_client.refund(&escrow_id, &t.buyer);
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
