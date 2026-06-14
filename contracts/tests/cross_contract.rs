#![cfg(test)]

use soroban_sdk::{testutils::Address as _, Address, Env, Vec};
use delego_escrow::{EscrowContract, EscrowContractClient, EscrowStatus};
use delego_permissions::{PermissionsContract, PermissionsContractClient};

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
        env.mock_all_auths_allowing_non_root_auth();

        let admin = Address::generate(&env);
        let buyer = Address::generate(&env);
        let seller = Address::generate(&env);
        let agent = Address::generate(&env);

        let token_admin = Address::generate(&env);
        let token_contract_id = env.register_stellar_asset_contract(token_admin.clone());
        let token_admin_client = soroban_sdk::token::StellarAssetClient::new(&env, &token_contract_id);
        token_admin_client.mint(&buyer, &10000);

        let escrow_contract_id = env.register(EscrowContract, ());
        let permissions_contract_id = env.register(PermissionsContract, ());

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
#[should_panic(expected = "Spend not authorized")]
fn test_permission_checked_before_escrow_fund_fails_without_permission() {
    let t = TestEnv::setup();
    let escrow_client = EscrowContractClient::new(&t.env, &t.escrow_contract_id);

    // Try to fund escrow as agent WITHOUT permission
    escrow_client.create_escrow(
        &t.buyer,
        &t.agent,
        &t.permissions_contract_id,
        &t.seller,
        &t.token_contract_id,
        &200,
        &3600,
    );
}

#[test]
#[should_panic(expected = "Spend not authorized")]
fn test_permission_checked_before_escrow_fund_fails_exceeding_limit() {
    let t = TestEnv::setup();
    let escrow_client = EscrowContractClient::new(&t.env, &t.escrow_contract_id);
    let perm_client = PermissionsContractClient::new(&t.env, &t.permissions_contract_id);

    let per_tx_limit = 500i128;
    let total_limit = 1000i128;
    let expiry = t.env.ledger().timestamp() + 3600;
    let merchants = Vec::new(&t.env);

    // Grant permission
    perm_client.grant(&t.buyer, &t.agent, &per_tx_limit, &total_limit, &expiry, &merchants);
        
    // Try to spend 600 (exceeds per tx limit 500)
    escrow_client.create_escrow(
        &t.buyer,
        &t.agent,
        &t.permissions_contract_id,
        &t.seller,
        &t.token_contract_id,
        &600,
        &3600,
    );
}

#[test]
fn test_permission_checked_before_escrow_fund_succeeds() {
    let t = TestEnv::setup();
    let escrow_client = EscrowContractClient::new(&t.env, &t.escrow_contract_id);
    let perm_client = PermissionsContractClient::new(&t.env, &t.permissions_contract_id);

    let per_tx_limit = 500i128;
    let total_limit = 1000i128;
    let expiry = t.env.ledger().timestamp() + 3600;
    let merchants = Vec::new(&t.env);

    // Grant permission
    perm_client.grant(&t.buyer, &t.agent, &per_tx_limit, &total_limit, &expiry, &merchants);

    // Fund escrow within limit
    let escrow_id = escrow_client.create_escrow(
        &t.buyer,
        &t.agent,
        &t.permissions_contract_id,
        &t.seller,
        &t.token_contract_id,
        &400,
        &3600,
    );

    assert_eq!(escrow_id, 1);
    let record = escrow_client.get_escrow(&escrow_id);
    assert_eq!(record.amount, 400);
}

#[test]
fn test_end_to_end_delegated_purchase() {
    let t = TestEnv::setup();
    let escrow_client = EscrowContractClient::new(&t.env, &t.escrow_contract_id);
    let perm_client = PermissionsContractClient::new(&t.env, &t.permissions_contract_id);
    let token_client = soroban_sdk::token::Client::new(&t.env, &t.token_contract_id);

    let per_tx_limit = 500i128;
    let total_limit = 1000i128;
    let expiry = t.env.ledger().timestamp() + 3600;
    let mut merchants = Vec::new(&t.env);
    merchants.push_back(t.seller.clone());

    // 1. Grant permission to agent
    perm_client.grant(&t.buyer, &t.agent, &per_tx_limit, &total_limit, &expiry, &merchants);

    // 2. Fund escrow as agent (on behalf of buyer)
    let escrow_id = escrow_client.create_escrow(
        &t.buyer,
        &t.agent,
        &t.permissions_contract_id,
        &t.seller,
        &t.token_contract_id,
        &400,
        &3600,
    );

    // Verify balances after deposit
    assert_eq!(token_client.balance(&t.buyer), 9600);
    assert_eq!(token_client.balance(&t.escrow_contract_id), 400);
    assert_eq!(token_client.balance(&t.seller), 0);

    // 3. Release escrow
    escrow_client.release(&escrow_id, &t.buyer);

    // Verify balances after release
    assert_eq!(token_client.balance(&t.buyer), 9600);
    assert_eq!(token_client.balance(&t.escrow_contract_id), 0);
    assert_eq!(token_client.balance(&t.seller), 400);

    // Verify escrow status is Released
    let record = escrow_client.get_escrow(&escrow_id);
    assert!(matches!(record.status, EscrowStatus::Released));
}
