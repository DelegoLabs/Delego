#![cfg(test)]

use soroban_sdk::{
    testutils::{Address as _, Ledger, MockAuth, MockAuthInvoke},
    Address, BytesN, Env, IntoVal,
};
use crate::{EscrowContract, EscrowContractClient, EscrowError, EscrowStatus};

struct TestEnv {
    env: Env,
    admin: Address,
    buyer: Address,
    seller: Address,
    agent: Address,
    token_contract_id: Address,
    escrow_contract_id: Address,
}

impl TestEnv {
    fn setup() -> Self {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let buyer = Address::generate(&env);
        let seller = Address::generate(&env);
        let agent = Address::generate(&env);
        let treasury = Address::generate(&env);

        let token_admin = Address::generate(&env);
        let token_contract_id = env.register_stellar_asset_contract(token_admin.clone());
        let token_admin_client =
            soroban_sdk::token::StellarAssetClient::new(&env, &token_contract_id);
        token_admin_client.mint(&buyer, &10000);

        let escrow_contract_id = env.register(EscrowContract, ());
        let escrow_client = EscrowContractClient::new(&env, &escrow_contract_id);
        let fee_bps = 0u32; // 0% for tests
        let min_amount = 100i128;
        let max_amount = 10000i128;
        escrow_client.initialize(&admin, &fee_bps, &treasury, &min_amount, &max_amount);

        TestEnv {
            env,
            admin,
            buyer,
            seller,
            agent,
            token_contract_id,
            escrow_contract_id,
        }
    }

    fn order_id(&self) -> BytesN<32> {
        BytesN::from_array(&self.env, &[7u8; 32])
    }
}

fn deposit_escrow(t: &TestEnv, amount: i128, timeout_ledgers: u32) -> u64 {
    let escrow_client = EscrowContractClient::new(&t.env, &t.escrow_contract_id);
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
fn test_full_purchase_lifecycle() {
    let t = TestEnv::setup();
    let escrow_client = EscrowContractClient::new(&t.env, &t.escrow_contract_id);
    let token_client = soroban_sdk::token::Client::new(&t.env, &t.token_contract_id);

    let amount = 1000i128;
    let timeout_ledgers = 100u32;

    assert_eq!(token_client.balance(&t.buyer), 10000);
    assert_eq!(token_client.balance(&t.seller), 0);
    assert_eq!(token_client.balance(&t.escrow_contract_id), 0);

    let escrow_id = deposit_escrow(&t, amount, timeout_ledgers);

    assert_eq!(token_client.balance(&t.buyer), 9000);
    assert_eq!(token_client.balance(&t.escrow_contract_id), 1000);

    assert!(escrow_client.release(&escrow_id, &t.buyer));

    assert_eq!(token_client.balance(&t.seller), 1000);
    assert_eq!(token_client.balance(&t.escrow_contract_id), 0);

    let record = escrow_client.get_escrow(&escrow_id);
    assert_eq!(record.status, EscrowStatus::Released);
    assert_eq!(record.escrow_id, escrow_id);
}

#[test]
fn test_full_refund_lifecycle() {
    let t = TestEnv::setup();
    let escrow_client = EscrowContractClient::new(&t.env, &t.escrow_contract_id);
    let token_client = soroban_sdk::token::Client::new(&t.env, &t.token_contract_id);

    let escrow_id = deposit_escrow(&t, 1000, 100);

    assert!(escrow_client.refund(&escrow_id, &t.seller));

    assert_eq!(token_client.balance(&t.buyer), 10000);
    assert_eq!(token_client.balance(&t.escrow_contract_id), 0);

    let record = escrow_client.get_escrow(&escrow_id);
    assert_eq!(record.status, EscrowStatus::Refunded);
}

#[test]
fn test_dispute_resolution_to_seller() {
    let t = TestEnv::setup();
    let escrow_client = EscrowContractClient::new(&t.env, &t.escrow_contract_id);
    let token_client = soroban_sdk::token::Client::new(&t.env, &t.token_contract_id);

    let escrow_id = deposit_escrow(&t, 1000, 100);

    assert!(escrow_client.dispute(&escrow_id, &t.buyer));
    assert!(escrow_client.resolve_dispute(&escrow_id, &t.admin, &true));

    assert_eq!(token_client.balance(&t.seller), 1000);
    assert_eq!(token_client.balance(&t.buyer), 9000);

    let record = escrow_client.get_escrow(&escrow_id);
    assert_eq!(record.status, EscrowStatus::Released);
}

#[test]
fn test_dispute_resolution_to_buyer() {
    let t = TestEnv::setup();
    let escrow_client = EscrowContractClient::new(&t.env, &t.escrow_contract_id);
    let token_client = soroban_sdk::token::Client::new(&t.env, &t.token_contract_id);

    let escrow_id = deposit_escrow(&t, 1000, 100);

    assert!(escrow_client.dispute(&escrow_id, &t.seller));
    assert!(escrow_client.resolve_dispute(&escrow_id, &t.admin, &false));

    assert_eq!(token_client.balance(&t.seller), 0);
    assert_eq!(token_client.balance(&t.buyer), 10000);

    let record = escrow_client.get_escrow(&escrow_id);
    assert_eq!(record.status, EscrowStatus::Refunded);
}

#[test]
fn test_dispute_blocks_release_and_refund() {
    let t = TestEnv::setup();
    let escrow_client = EscrowContractClient::new(&t.env, &t.escrow_contract_id);

    let escrow_id = deposit_escrow(&t, 1000, 100);
    assert!(escrow_client.dispute(&escrow_id, &t.buyer));

    assert_eq!(
        escrow_client.try_release(&escrow_id, &t.buyer),
        Err(Ok(EscrowError::InvalidStatus))
    );
    assert_eq!(
        escrow_client.try_refund(&escrow_id, &t.seller),
        Err(Ok(EscrowError::InvalidStatus))
    );
}

#[test]
#[should_panic]
fn test_deposit_insufficient_balance() {
    let t = TestEnv::setup();
    deposit_escrow(&t, 15000, 100);
}

#[test]
fn test_release_wrong_caller() {
    let t = TestEnv::setup();
    let escrow_client = EscrowContractClient::new(&t.env, &t.escrow_contract_id);

    let escrow_id = deposit_escrow(&t, 1000, 100);

    assert_eq!(
        escrow_client.try_release(&escrow_id, &t.agent),
        Err(Ok(EscrowError::Unauthorized))
    );
}

#[test]
fn test_double_release_prevention() {
    let t = TestEnv::setup();
    let escrow_client = EscrowContractClient::new(&t.env, &t.escrow_contract_id);

    let escrow_id = deposit_escrow(&t, 1000, 100);

    assert!(escrow_client.release(&escrow_id, &t.buyer));
    assert_eq!(
        escrow_client.try_release(&escrow_id, &t.buyer),
        Err(Ok(EscrowError::AlreadyReleased))
    );
}

#[test]
fn test_refund_before_timeout_fails() {
    let t = TestEnv::setup();
    let escrow_client = EscrowContractClient::new(&t.env, &t.escrow_contract_id);

    let escrow_id = deposit_escrow(&t, 1000, 100);

    assert_eq!(
        escrow_client.try_refund(&escrow_id, &t.buyer),
        Err(Ok(EscrowError::TimeoutNotReached))
    );
}

#[test]
fn test_timeout_auto_refund() {
    let t = TestEnv::setup();
    let escrow_client = EscrowContractClient::new(&t.env, &t.escrow_contract_id);
    let token_client = soroban_sdk::token::Client::new(&t.env, &t.token_contract_id);

    let timeout_ledgers = 100u32;
    let escrow_id = deposit_escrow(&t, 1000, timeout_ledgers);

    let record = escrow_client.get_escrow(&escrow_id);
    t.env
        .ledger()
        .set_sequence_number(record.timeout_ledger);

    assert!(escrow_client.refund(&escrow_id, &t.buyer));
    assert_eq!(token_client.balance(&t.buyer), 10000);
}

#[test]
fn test_deposit_requires_buyer_auth() {
    let t = TestEnv::setup();
    let escrow_client = EscrowContractClient::new(&t.env, &t.escrow_contract_id);

    let deposit_invoke = MockAuthInvoke {
        contract: &t.escrow_contract_id,
        fn_name: "deposit",
        args: (
            t.buyer.clone(),
            t.seller.clone(),
            t.token_contract_id.clone(),
            1000i128,
            t.order_id(),
            100u32,
        )
            .into_val(&t.env),
        sub_invokes: &[],
    };

    let res = escrow_client
        .mock_auths(&[MockAuth {
            address: &t.agent,
            invoke: &deposit_invoke,
        }])
        .try_deposit(
            &t.buyer,
            &t.seller,
            &t.token_contract_id,
            &1000,
            &t.order_id(),
            &100,
        );
    assert!(res.is_err());
}

#[test]
fn test_get_escrow_returns_full_record() {
    let t = TestEnv::setup();
    let escrow_client = EscrowContractClient::new(&t.env, &t.escrow_contract_id);

    let escrow_id = deposit_escrow(&t, 500, 50);
    let record = escrow_client.get_escrow(&escrow_id);

    assert_eq!(record.escrow_id, escrow_id);
    assert_eq!(record.buyer, t.buyer);
    assert_eq!(record.seller, t.seller);
    assert_eq!(record.token, t.token_contract_id);
    assert_eq!(record.amount, 500);
    assert_eq!(record.status, EscrowStatus::Funded);
    assert_eq!(record.order_id, t.order_id());
    assert!(record.timeout_ledger > t.env.ledger().sequence());
}
