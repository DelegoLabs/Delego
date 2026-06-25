#![cfg(test)]

use soroban_sdk::{testutils::Address as _, Address, BytesN, Env, Vec};
use delego_escrow::{EscrowContract, EscrowContractClient, EscrowStatus};
use delego_permissions::{PermissionsContract, PermissionsContractClient};

struct TestEnv {
    env: Env,
    admin: Address,
    buyer: Address,
    seller: Address,
    agent: Address,
    token_contract_id: Address,
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
        let treasury = Address::generate(&env);

        let token_admin = Address::generate(&env);
        #[allow(deprecated)]
        let token_contract_id = env.register_stellar_asset_contract(token_admin.clone());
        let token_admin_client =
            soroban_sdk::token::StellarAssetClient::new(&env, &token_contract_id);
        token_admin_client.mint(&buyer, &10000);

        let escrow_contract_id = env.register(EscrowContract, ());
        let permissions_contract_id = env.register(PermissionsContract, ());

        let escrow_client = EscrowContractClient::new(&env, &escrow_contract_id);
        let fee_bps = 0u32; // 0% for tests
        let min_amount = 100i128;
        let max_amount = 10000i128;
        escrow_client.initialize(&admin, &fee_bps, &treasury, &min_amount, &max_amount);
        escrow_client.add_token(&admin, &token_contract_id);

        TestEnv {
            env,
            admin,
            buyer,
            seller,
            agent,
            token_contract_id,
            escrow_contract_id,
            permissions_contract_id,
        }
    }

    fn order_id(&self) -> BytesN<32> {
        BytesN::from_array(&self.env, &[1u8; 32])
    }
}

/// Simulates a delegated purchase: agent executes spend via permissions, then buyer deposits.
fn delegated_deposit(t: &TestEnv, amount: i128, timeout_ledgers: u32) -> u64 {
    let perm_client = PermissionsContractClient::new(&t.env, &t.permissions_contract_id);
    let escrow_client = EscrowContractClient::new(&t.env, &t.escrow_contract_id);

    perm_client.execute_spend(&t.buyer, &t.agent, &amount, &t.seller);
    escrow_client.deposit(
        &t.buyer,
        &t.seller,
        &t.token_contract_id,
        &amount,
        &t.order_id(),
        &timeout_ledgers,
    )
}

#[test]
#[should_panic(expected = "Spend not authorized")]
fn test_permission_checked_before_escrow_fund_fails_without_permission() {
    let t = TestEnv::setup();
    let perm_client = PermissionsContractClient::new(&t.env, &t.permissions_contract_id);

    // Agent tries to spend without a granted permission.
    perm_client.execute_spend(&t.buyer, &t.agent, &200, &t.seller);
}

#[test]
#[should_panic(expected = "Spend not authorized")]
fn test_permission_checked_before_escrow_fund_fails_exceeding_limit() {
    let t = TestEnv::setup();
    let perm_client = PermissionsContractClient::new(&t.env, &t.permissions_contract_id);

    let limit_total = 1000i128;
    let limit_per_tx = 500i128;
    let ttl_ledgers = 36000u32;
    let merchants = Vec::new(&t.env);

    perm_client.grant(
        &t.buyer,
        &t.agent,
        &limit_total,
        &limit_per_tx,
        &merchants,
        &ttl_ledgers,
    );

    // Exceeds per-tx limit of 500.
    perm_client.execute_spend(&t.buyer, &t.agent, &600, &t.seller);
}

#[test]
fn test_permission_checked_before_escrow_fund_succeeds() {
    let t = TestEnv::setup();
    let escrow_client = EscrowContractClient::new(&t.env, &t.escrow_contract_id);
    let perm_client = PermissionsContractClient::new(&t.env, &t.permissions_contract_id);

    let limit_total = 1000i128;
    let limit_per_tx = 500i128;
    let ttl_ledgers = 36000u32;
    let merchants = Vec::new(&t.env);

    perm_client.grant(
        &t.buyer,
        &t.agent,
        &limit_total,
        &limit_per_tx,
        &merchants,
        &ttl_ledgers,
    );

    let escrow_id = delegated_deposit(&t, 400, 3600);

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

    let limit_total = 1000i128;
    let limit_per_tx = 500i128;
    let ttl_ledgers = 36000u32;
    let mut merchants = Vec::new(&t.env);
    merchants.push_back(t.seller.clone());

    perm_client.grant(
        &t.buyer,
        &t.agent,
        &limit_total,
        &limit_per_tx,
        &merchants,
        &ttl_ledgers,
    );

    let escrow_id = delegated_deposit(&t, 400, 3600);

    assert_eq!(token_client.balance(&t.buyer), 9600);
    assert_eq!(token_client.balance(&t.escrow_contract_id), 400);
    assert_eq!(token_client.balance(&t.seller), 0);

    escrow_client.release(&escrow_id, &t.buyer);

    assert_eq!(token_client.balance(&t.buyer), 9600);
    assert_eq!(token_client.balance(&t.escrow_contract_id), 0);
    assert_eq!(token_client.balance(&t.seller), 400);

    let record = escrow_client.get_escrow(&escrow_id);
    assert!(matches!(record.status, EscrowStatus::Released));
}
