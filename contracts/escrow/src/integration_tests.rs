#![cfg(test)]

use crate::{EscrowContract, EscrowContractClient, EscrowError, EscrowStatus, EscrowTerminalState};
use soroban_sdk::{
    symbol_short, testutils::{Address as _, Events, Ledger, MockAuth, MockAuthInvoke},
    Address, BytesN, Env, IntoVal,
};

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
        let token_contract_id = env
            .register_stellar_asset_contract_v2(token_admin.clone())
            .address();
        let token_admin_client =
            soroban_sdk::token::StellarAssetClient::new(&env, &token_contract_id);
        token_admin_client.mint(&buyer, &10000);

        let escrow_contract_id = env.register(EscrowContract, ());
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
        &None,
        &None,
    )
}

#[test]
fn test_deposit_with_whitelisted_token_succeeds() {
    let t = TestEnv::setup();
    let escrow_client = EscrowContractClient::new(&t.env, &t.escrow_contract_id);

    assert!(escrow_client.is_token_allowed(&t.token_contract_id));
    let escrow_id = deposit_escrow(&t, 1000, 100);

    let record = escrow_client.get_escrow(&escrow_id);
    assert_eq!(record.token, t.token_contract_id);
    assert_eq!(record.status, EscrowStatus::Funded);
}

#[test]
fn test_deposit_with_non_whitelisted_token_fails() {
    let t = TestEnv::setup();
    let escrow_client = EscrowContractClient::new(&t.env, &t.escrow_contract_id);

    let other_token_admin = Address::generate(&t.env);
    let other_token_contract_id = t
        .env
        .register_stellar_asset_contract_v2(other_token_admin.clone())
        .address();

    assert_eq!(
        escrow_client.try_deposit(
            &t.buyer,
            &t.seller,
            &other_token_contract_id,
            &1000,
            &t.order_id(),
            &100,
            &None,
            &None,
        ),
        Err(Ok(EscrowError::TokenNotWhitelisted))
    );
}

#[test]
fn test_add_token_by_non_admin_fails() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let agent = Address::generate(&env);
    let treasury = Address::generate(&env);

    let escrow_contract_id = env.register(EscrowContract, ());
    let escrow_client = EscrowContractClient::new(&env, &escrow_contract_id);
    let fee_bps = 0u32;
    let min_amount = 100i128;
    let max_amount = 10000i128;
    escrow_client.initialize(&admin, &fee_bps, &treasury, &min_amount, &max_amount);

    let new_token = Address::generate(&env);

    assert_eq!(
        escrow_client.try_add_token(&agent, &new_token),
        Err(Ok(EscrowError::Unauthorized))
    );
    assert!(!escrow_client.is_token_allowed(&new_token));
}

#[test]
fn test_remove_token_blocks_future_deposit() {
    let t = TestEnv::setup();
    let escrow_client = EscrowContractClient::new(&t.env, &t.escrow_contract_id);

    assert!(escrow_client.remove_token(&t.admin, &t.token_contract_id));
    assert!(!escrow_client.is_token_allowed(&t.token_contract_id));
    assert_eq!(
        escrow_client.try_deposit(
            &t.buyer,
            &t.seller,
            &t.token_contract_id,
            &1000,
            &t.order_id(),
            &100,
            &None,
            &None,
        ),
        Err(Ok(EscrowError::TokenNotWhitelisted))
    );
}

#[test]
fn test_list_tokens_returns_all_added_tokens() {
    let t = TestEnv::setup();
    let escrow_client = EscrowContractClient::new(&t.env, &t.escrow_contract_id);
    let second_token = Address::generate(&t.env);

    assert!(escrow_client.add_token(&t.admin, &second_token));

    let tokens = escrow_client.list_tokens();
    assert_eq!(tokens.len(), 2);
    assert!(tokens.contains(&t.token_contract_id));
    assert!(tokens.contains(&second_token));
}

#[test]
fn test_add_token_is_idempotent() {
    let t = TestEnv::setup();
    let escrow_client = EscrowContractClient::new(&t.env, &t.escrow_contract_id);

    assert!(escrow_client.add_token(&t.admin, &t.token_contract_id));
    assert!(escrow_client.add_token(&t.admin, &t.token_contract_id));

    let tokens = escrow_client.list_tokens();
    assert_eq!(tokens.len(), 1);
    assert!(tokens.contains(&t.token_contract_id));
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

    assert!(escrow_client.release(&escrow_id, &t.buyer, &t.seller));

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
        escrow_client.try_release(&escrow_id, &t.buyer, &t.seller),
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
        escrow_client.try_release(&escrow_id, &t.agent, &t.seller),
        Err(Ok(EscrowError::Unauthorized))
    );
    assert_eq!(
        escrow_client.get_escrow(&escrow_id).status,
        EscrowStatus::Funded
    );
}

#[test]
fn test_release_with_wrong_recipient_fails() {
    let t = TestEnv::setup();
    let escrow_client = EscrowContractClient::new(&t.env, &t.escrow_contract_id);

    let escrow_id = deposit_escrow(&t, 1000, 100);

    let wrong_recipient = Address::generate(&t.env);
    assert_eq!(
        escrow_client.try_release(&escrow_id, &t.buyer, &wrong_recipient),
        Err(Ok(EscrowError::InvalidReleaseRecipient))
    );
}

#[test]
fn test_double_release_prevention() {
    let t = TestEnv::setup();
    let escrow_client = EscrowContractClient::new(&t.env, &t.escrow_contract_id);
    let token_client = soroban_sdk::token::Client::new(&t.env, &t.token_contract_id);

    let escrow_id = deposit_escrow(&t, 1000, 100);

    assert!(escrow_client.release(&escrow_id, &t.buyer, &t.seller));
    assert_eq!(token_client.balance(&t.seller), 1000);
    assert_eq!(
        escrow_client.get_escrow(&escrow_id).status,
        EscrowStatus::Released
    );

    assert_eq!(
        escrow_client.try_release(&escrow_id, &t.buyer, &t.seller),
        Err(Ok(EscrowError::AlreadyReleased))
    );
    assert_eq!(token_client.balance(&t.seller), 1000);
}

#[test]
fn test_double_refund_prevention() {
    let t = TestEnv::setup();
    let escrow_client = EscrowContractClient::new(&t.env, &t.escrow_contract_id);

    let escrow_id = deposit_escrow(&t, 1000, 100);

    assert!(escrow_client.refund(&escrow_id, &t.seller));
    assert_eq!(
        escrow_client.try_refund(&escrow_id, &t.seller),
        Err(Ok(EscrowError::AlreadyRefunded))
    );
}

#[test]
fn test_release_on_refunded_escrow_fails() {
    let t = TestEnv::setup();
    let escrow_client = EscrowContractClient::new(&t.env, &t.escrow_contract_id);

    let escrow_id = deposit_escrow(&t, 1000, 100);

    assert!(escrow_client.refund(&escrow_id, &t.seller));
    assert_eq!(
        escrow_client.try_release(&escrow_id, &t.buyer, &t.seller),
        Err(Ok(EscrowError::AlreadyRefunded))
    );
}

#[test]
fn test_refund_on_released_escrow_fails() {
    let t = TestEnv::setup();
    let escrow_client = EscrowContractClient::new(&t.env, &t.escrow_contract_id);

    let escrow_id = deposit_escrow(&t, 1000, 100);

    assert!(escrow_client.release(&escrow_id, &t.buyer, &t.seller));
    assert_eq!(
        escrow_client.try_refund(&escrow_id, &t.seller),
        Err(Ok(EscrowError::AlreadyReleased))
    );
}

#[test]
fn test_terminal_state_from_status() {
    assert_eq!(
        EscrowTerminalState::from_status(&EscrowStatus::Released),
        Some(EscrowTerminalState::Released)
    );
    assert_eq!(
        EscrowTerminalState::from_status(&EscrowStatus::Refunded),
        Some(EscrowTerminalState::Refunded)
    );
    assert_eq!(
        EscrowTerminalState::from_status(&EscrowStatus::Funded),
        None
    );
    assert_eq!(
        EscrowTerminalState::from_status(&EscrowStatus::Disputed),
        None
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
    t.env.ledger().set_sequence_number(record.timeout_ledger);

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
            Option::<BytesN<32>>::None,
            Option::<soroban_sdk::Symbol>::None,
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
            &None,
            &None,
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
    assert_eq!(record.released_amount, 0);
    assert_eq!(record.status, EscrowStatus::Funded);
    assert_eq!(record.order_id, t.order_id());
    assert!(record.timeout_ledger > t.env.ledger().sequence());
}

// ── Issue #173: RefundEligibility getter tests ──────────────────────────

#[test]
fn test_refund_eligibility_seller_always_eligible() {
    let t = TestEnv::setup();
    let client = EscrowContractClient::new(&t.env, &t.escrow_contract_id);
    let eid = deposit_escrow(&t, 1000, 100);

    let re = client.get_refund_eligibility(&eid, &t.seller);
    assert_eq!(re.escrow_id, eid);
    assert!(re.eligible);
    assert_eq!(re.reason, soroban_sdk::symbol_short!("ok"));
}

#[test]
fn test_refund_eligibility_admin_always_eligible() {
    let t = TestEnv::setup();
    let client = EscrowContractClient::new(&t.env, &t.escrow_contract_id);
    let eid = deposit_escrow(&t, 1000, 100);

    let re = client.get_refund_eligibility(&eid, &t.admin);
    assert!(re.eligible);
    assert_eq!(re.reason, soroban_sdk::symbol_short!("ok"));
}

#[test]
fn test_refund_eligibility_buyer_before_timeout() {
    let t = TestEnv::setup();
    let client = EscrowContractClient::new(&t.env, &t.escrow_contract_id);
    let eid = deposit_escrow(&t, 1000, 100);

    let re = client.get_refund_eligibility(&eid, &t.buyer);
    assert!(!re.eligible);
    assert_eq!(re.reason, soroban_sdk::symbol_short!("timeout"));
}

#[test]
fn test_refund_eligibility_buyer_after_timeout() {
    let t = TestEnv::setup();
    let client = EscrowContractClient::new(&t.env, &t.escrow_contract_id);
    let eid = deposit_escrow(&t, 1000, 100);

    let record = client.get_escrow(&eid);
    t.env.ledger().set_sequence_number(record.timeout_ledger);

    let re = client.get_refund_eligibility(&eid, &t.buyer);
    assert!(re.eligible);
    assert_eq!(re.reason, soroban_sdk::symbol_short!("ok"));
}

#[test]
fn test_refund_eligibility_not_found() {
    let t = TestEnv::setup();
    let client = EscrowContractClient::new(&t.env, &t.escrow_contract_id);

    let re = client.get_refund_eligibility(&999, &t.buyer);
    assert!(!re.eligible);
    assert_eq!(re.reason, soroban_sdk::symbol_short!("notfund"));
}

#[test]
fn test_refund_eligibility_already_released() {
    let t = TestEnv::setup();
    let client = EscrowContractClient::new(&t.env, &t.escrow_contract_id);
    let eid = deposit_escrow(&t, 1000, 100);
    client.release(&eid, &t.buyer, &t.seller);

    let re = client.get_refund_eligibility(&eid, &t.seller);
    assert!(!re.eligible);
    assert_eq!(re.reason, soroban_sdk::symbol_short!("released"));
}

#[test]
fn test_refund_eligibility_already_refunded() {
    let t = TestEnv::setup();
    let client = EscrowContractClient::new(&t.env, &t.escrow_contract_id);
    let eid = deposit_escrow(&t, 1000, 100);
    client.refund(&eid, &t.seller);

    let re = client.get_refund_eligibility(&eid, &t.buyer);
    assert!(!re.eligible);
    assert_eq!(re.reason, soroban_sdk::symbol_short!("refunded"));
}

#[test]
fn test_refund_eligibility_disputed() {
    let t = TestEnv::setup();
    let client = EscrowContractClient::new(&t.env, &t.escrow_contract_id);
    let eid = deposit_escrow(&t, 1000, 100);
    client.dispute(&eid, &t.buyer);

    let re = client.get_refund_eligibility(&eid, &t.seller);
    assert!(!re.eligible);
    assert_eq!(re.reason, soroban_sdk::symbol_short!("disputed"));
}

#[test]
fn test_refund_eligibility_unauthorized_stranger() {
    let t = TestEnv::setup();
    let client = EscrowContractClient::new(&t.env, &t.escrow_contract_id);
    let eid = deposit_escrow(&t, 1000, 100);

    let re = client.get_refund_eligibility(&eid, &t.agent);
    assert!(!re.eligible);
    assert_eq!(re.reason, soroban_sdk::symbol_short!("noauth"));
}

// ── ReleaseEligibility getter tests ──────────────────────────────────────

#[test]
fn test_release_eligibility_funded_before_timeout() {
    let t = TestEnv::setup();
    let client = EscrowContractClient::new(&t.env, &t.escrow_contract_id);
    let eid = deposit_escrow(&t, 1000, 100);

    let re = client.get_release_eligibility(&eid);
    assert_eq!(re.escrow_id, t.order_id());
    assert!(re.eligible);
    assert_eq!(re.reason, soroban_sdk::symbol_short!("ok"));
}

#[test]
fn test_release_eligibility_disputed_blocks_release() {
    let t = TestEnv::setup();
    let client = EscrowContractClient::new(&t.env, &t.escrow_contract_id);
    let eid = deposit_escrow(&t, 1000, 100);
    client.dispute(&eid, &t.buyer);

    let re = client.get_release_eligibility(&eid);
    assert_eq!(re.escrow_id, t.order_id());
    assert!(!re.eligible);
    assert_eq!(re.reason, soroban_sdk::symbol_short!("disputed"));
}

#[test]
fn test_release_eligibility_timeout_blocks_release() {
    let t = TestEnv::setup();
    let client = EscrowContractClient::new(&t.env, &t.escrow_contract_id);
    let eid = deposit_escrow(&t, 1000, 100);

    let record = client.get_escrow(&eid);
    t.env.ledger().set_sequence_number(record.timeout_ledger);

    let re = client.get_release_eligibility(&eid);
    assert_eq!(re.escrow_id, t.order_id());
    assert!(!re.eligible);
    assert_eq!(re.reason, soroban_sdk::symbol_short!("timeout"));
}

#[test]
fn test_release_eligibility_terminal_release_blocks_release() {
    let t = TestEnv::setup();
    let client = EscrowContractClient::new(&t.env, &t.escrow_contract_id);
    let eid = deposit_escrow(&t, 1000, 100);
    client.release(&eid, &t.buyer, &t.seller);

    let re = client.get_release_eligibility(&eid);
    assert_eq!(re.escrow_id, t.order_id());
    assert!(!re.eligible);
    assert_eq!(re.reason, soroban_sdk::symbol_short!("released"));
}

#[test]
fn test_release_eligibility_terminal_refund_blocks_release() {
    let t = TestEnv::setup();
    let client = EscrowContractClient::new(&t.env, &t.escrow_contract_id);
    let eid = deposit_escrow(&t, 1000, 100);
    client.refund(&eid, &t.seller);

    let re = client.get_release_eligibility(&eid);
    assert_eq!(re.escrow_id, t.order_id());
    assert!(!re.eligible);
    assert_eq!(re.reason, soroban_sdk::symbol_short!("refunded"));
}

// ── EscrowReceipt getter tests (get_receipt) ─────────────────────────────

/// Success path: receipt returned immediately after deposit (Funded state).
#[test]
fn test_get_receipt_funded_state() {
    let t = TestEnv::setup();
    let client = EscrowContractClient::new(&t.env, &t.escrow_contract_id);

    let eid = deposit_escrow(&t, 1000, 100);
    let receipt = client.get_receipt(&eid);

    assert_eq!(receipt.escrow_id, eid);
    assert_eq!(receipt.buyer, t.buyer);
    assert_eq!(receipt.seller, t.seller);
    assert_eq!(receipt.order_id, t.order_id());
    assert_eq!(receipt.status, EscrowStatus::Funded);
}

/// Success path: receipt reflects Released status after release.
#[test]
fn test_get_receipt_released_state() {
    let t = TestEnv::setup();
    let client = EscrowContractClient::new(&t.env, &t.escrow_contract_id);

    let eid = deposit_escrow(&t, 1000, 100);
    client.release(&eid, &t.buyer, &t.seller);

    let receipt = client.get_receipt(&eid);
    assert_eq!(receipt.escrow_id, eid);
    assert_eq!(receipt.status, EscrowStatus::Released);
    // Buyer and seller are unchanged after release
    assert_eq!(receipt.buyer, t.buyer);
    assert_eq!(receipt.seller, t.seller);
    assert_eq!(receipt.order_id, t.order_id());
}

/// Success path: receipt reflects Refunded status after refund.
#[test]
fn test_get_receipt_refunded_state() {
    let t = TestEnv::setup();
    let client = EscrowContractClient::new(&t.env, &t.escrow_contract_id);

    let eid = deposit_escrow(&t, 1000, 100);
    client.refund(&eid, &t.seller);

    let receipt = client.get_receipt(&eid);
    assert_eq!(receipt.escrow_id, eid);
    assert_eq!(receipt.status, EscrowStatus::Refunded);
    assert_eq!(receipt.buyer, t.buyer);
    assert_eq!(receipt.seller, t.seller);
    assert_eq!(receipt.order_id, t.order_id());
}

/// Success path: receipt reflects Disputed status mid-lifecycle.
#[test]
fn test_get_receipt_disputed_state() {
    let t = TestEnv::setup();
    let client = EscrowContractClient::new(&t.env, &t.escrow_contract_id);

    let eid = deposit_escrow(&t, 1000, 100);
    client.dispute(&eid, &t.buyer);

    let receipt = client.get_receipt(&eid);
    assert_eq!(receipt.escrow_id, eid);
    assert_eq!(receipt.status, EscrowStatus::Disputed);
    assert_eq!(receipt.buyer, t.buyer);
    assert_eq!(receipt.seller, t.seller);
    assert_eq!(receipt.order_id, t.order_id());
}

/// Failure path: NotFound error for a non-existent escrow id.
#[test]
fn test_get_receipt_not_found() {
    let t = TestEnv::setup();
    let client = EscrowContractClient::new(&t.env, &t.escrow_contract_id);

    let result = client.try_get_receipt(&999u64);
    assert_eq!(result, Err(Ok(EscrowError::NotFound)));
}

// ── MerchantEscrowReceipt getter tests (get_merchant_receipt, issue #171) ─

/// Success path: funded escrow is release-eligible before timeout.
#[test]
fn test_get_merchant_receipt_funded_state() {
    let t = TestEnv::setup();
    let client = EscrowContractClient::new(&t.env, &t.escrow_contract_id);

    let eid = deposit_escrow(&t, 1000, 100);
    let receipt = client.get_merchant_receipt(&eid);

    assert_eq!(receipt.escrow_id, t.order_id());
    assert_eq!(receipt.merchant, t.seller);
    assert_eq!(receipt.buyer, t.buyer);
    assert_eq!(receipt.status, EscrowStatus::Funded);
    assert!(receipt.release_eligible);
}

/// Success path: disputed escrow is not release-eligible.
#[test]
fn test_get_merchant_receipt_disputed_state() {
    let t = TestEnv::setup();
    let client = EscrowContractClient::new(&t.env, &t.escrow_contract_id);

    let eid = deposit_escrow(&t, 1000, 100);
    client.dispute(&eid, &t.buyer);

    let receipt = client.get_merchant_receipt(&eid);
    assert_eq!(receipt.escrow_id, t.order_id());
    assert_eq!(receipt.merchant, t.seller);
    assert_eq!(receipt.buyer, t.buyer);
    assert_eq!(receipt.status, EscrowStatus::Disputed);
    assert!(!receipt.release_eligible);
}

/// Success path: released escrow is not release-eligible.
#[test]
fn test_get_merchant_receipt_released_state() {
    let t = TestEnv::setup();
    let client = EscrowContractClient::new(&t.env, &t.escrow_contract_id);

    let eid = deposit_escrow(&t, 1000, 100);
    client.release(&eid, &t.buyer, &t.seller);

    let receipt = client.get_merchant_receipt(&eid);
    assert_eq!(receipt.status, EscrowStatus::Released);
    assert!(!receipt.release_eligible);
    assert_eq!(receipt.merchant, t.seller);
    assert_eq!(receipt.buyer, t.buyer);
    assert_eq!(receipt.escrow_id, t.order_id());
}

/// Success path: refunded escrow is not release-eligible.
#[test]
fn test_get_merchant_receipt_refunded_state() {
    let t = TestEnv::setup();
    let client = EscrowContractClient::new(&t.env, &t.escrow_contract_id);

    let eid = deposit_escrow(&t, 1000, 100);
    client.refund(&eid, &t.seller);

    let receipt = client.get_merchant_receipt(&eid);
    assert_eq!(receipt.status, EscrowStatus::Refunded);
    assert!(!receipt.release_eligible);
    assert_eq!(receipt.merchant, t.seller);
    assert_eq!(receipt.buyer, t.buyer);
    assert_eq!(receipt.escrow_id, t.order_id());
}

/// Failure path: NotFound for a non-existent escrow id.
#[test]
fn test_get_merchant_receipt_not_found() {
    let t = TestEnv::setup();
    let client = EscrowContractClient::new(&t.env, &t.escrow_contract_id);

    let result = client.try_get_merchant_receipt(&999u64);
    assert_eq!(result, Err(Ok(EscrowError::NotFound)));
}

#[test]
fn test_version_callable_without_auth() {
    let env = Env::default();
    // Intentionally do NOT mock all auths — version() requires no auth.
    let contract_id = env.register(EscrowContract, ());
    let client = EscrowContractClient::new(&env, &contract_id);

    let version = client.version();
    assert_eq!(version.name, symbol_short!("escrow"));
    assert_eq!(version.semver, symbol_short!("0_1_0"));
}

// ── Partial release tests ──────────────────────────────────────────────────

#[test]
fn test_partial_release_50_percent_stays_active() {
    let t = TestEnv::setup();
    let escrow_client = EscrowContractClient::new(&t.env, &t.escrow_contract_id);
    let token_client = soroban_sdk::token::Client::new(&t.env, &t.token_contract_id);

    let amount = 1000i128;
    let escrow_id = deposit_escrow(&t, amount, 100);

    let result = escrow_client.partial_release(&escrow_id, &t.buyer, &500);
    assert_eq!(result.released, 500);
    assert_eq!(result.remaining, 500);
    assert!(!result.fully_released);

    assert_eq!(token_client.balance(&t.seller), 500);
    assert_eq!(token_client.balance(&t.escrow_contract_id), 500);

    let record = escrow_client.get_escrow(&escrow_id);
    assert_eq!(record.released_amount, 500);
    assert_eq!(record.status, EscrowStatus::Funded);
}

#[test]
fn test_partial_release_remaining_50_percent_released() {
    let t = TestEnv::setup();
    let escrow_client = EscrowContractClient::new(&t.env, &t.escrow_contract_id);
    let token_client = soroban_sdk::token::Client::new(&t.env, &t.token_contract_id);

    let amount = 1000i128;
    let escrow_id = deposit_escrow(&t, amount, 100);

    escrow_client.partial_release(&escrow_id, &t.buyer, &500);
    let result = escrow_client.partial_release(&escrow_id, &t.buyer, &500);

    assert_eq!(result.released, 500);
    assert_eq!(result.remaining, 0);
    assert!(result.fully_released);

    assert_eq!(token_client.balance(&t.seller), 1000);
    assert_eq!(token_client.balance(&t.escrow_contract_id), 0);

    let record = escrow_client.get_escrow(&escrow_id);
    assert_eq!(record.released_amount, 1000);
    assert_eq!(record.status, EscrowStatus::Released);
}

#[test]
fn test_partial_release_exceeds_remaining_balance() {
    let t = TestEnv::setup();
    let escrow_client = EscrowContractClient::new(&t.env, &t.escrow_contract_id);

    let escrow_id = deposit_escrow(&t, 1000, 100);
    escrow_client.partial_release(&escrow_id, &t.buyer, &500);

    assert_eq!(
        escrow_client.try_partial_release(&escrow_id, &t.buyer, &501),
        Err(Ok(EscrowError::InsufficientEscrowBalance))
    );
}

#[test]
fn test_partial_release_zero_amount() {
    let t = TestEnv::setup();
    let escrow_client = EscrowContractClient::new(&t.env, &t.escrow_contract_id);

    let escrow_id = deposit_escrow(&t, 1000, 100);

    assert_eq!(
        escrow_client.try_partial_release(&escrow_id, &t.buyer, &0),
        Err(Ok(EscrowError::ZeroAmount))
    );
}

#[test]
fn test_full_release_via_release_still_works() {
    let t = TestEnv::setup();
    let escrow_client = EscrowContractClient::new(&t.env, &t.escrow_contract_id);
    let token_client = soroban_sdk::token::Client::new(&t.env, &t.token_contract_id);

    let amount = 1000i128;
    let escrow_id = deposit_escrow(&t, amount, 100);

    assert!(escrow_client.release(&escrow_id, &t.buyer, &t.seller));

    assert_eq!(token_client.balance(&t.seller), 1000);
    assert_eq!(token_client.balance(&t.escrow_contract_id), 0);

    let record = escrow_client.get_escrow(&escrow_id);
    assert_eq!(record.released_amount, 1000);
    assert_eq!(record.status, EscrowStatus::Released);
}

#[test]
fn test_refund_after_partial_release_refunds_unreleased_only() {
    let t = TestEnv::setup();
    let escrow_client = EscrowContractClient::new(&t.env, &t.escrow_contract_id);
    let token_client = soroban_sdk::token::Client::new(&t.env, &t.token_contract_id);

    let amount = 1000i128;
    let escrow_id = deposit_escrow(&t, amount, 100);

    escrow_client.partial_release(&escrow_id, &t.buyer, &300);
    assert!(escrow_client.refund(&escrow_id, &t.seller));

    assert_eq!(token_client.balance(&t.seller), 300);
    assert_eq!(token_client.balance(&t.buyer), 9700);
    assert_eq!(token_client.balance(&t.escrow_contract_id), 0);

    let record = escrow_client.get_escrow(&escrow_id);
    assert_eq!(record.status, EscrowStatus::Refunded);
}

// ── Issue #88: EscrowTimeoutView getter tests ────────────────────────────

#[test]
fn test_get_timeout_view_not_found() {
    // Returns EscrowError::NotFound for an unknown escrow id.
    let t = TestEnv::setup();
    let client = EscrowContractClient::new(&t.env, &t.escrow_contract_id);

    let res = client.try_get_timeout_view(&999u64);
    assert_eq!(res, Err(Ok(EscrowError::NotFound)));
}

#[test]
fn test_get_timeout_view_active_before_timeout() {
    // Funded escrow before timeout: refundable must be false.
    let t = TestEnv::setup();
    let client = EscrowContractClient::new(&t.env, &t.escrow_contract_id);

    let escrow_id = deposit_escrow(&t, 1000, 100);
    let record = client.get_escrow(&escrow_id);

    // Current ledger is before timeout_ledger at deposit time.
    assert!(t.env.ledger().sequence() < record.timeout_ledger);

    let view = client.get_timeout_view(&escrow_id);

    assert_eq!(view.escrow_id, t.order_id());
    assert_eq!(view.timeout_ledger, record.timeout_ledger);
    assert_eq!(view.current_ledger, t.env.ledger().sequence());
    assert!(!view.refundable);
}

#[test]
fn test_get_timeout_view_active_at_timeout() {
    // Funded escrow exactly at timeout: refundable must be true.
    let t = TestEnv::setup();
    let client = EscrowContractClient::new(&t.env, &t.escrow_contract_id);

    let escrow_id = deposit_escrow(&t, 1000, 100);
    let record = client.get_escrow(&escrow_id);

    t.env.ledger().set_sequence_number(record.timeout_ledger);

    let view = client.get_timeout_view(&escrow_id);

    assert_eq!(view.timeout_ledger, record.timeout_ledger);
    assert_eq!(view.current_ledger, record.timeout_ledger);
    assert!(view.refundable);
}

#[test]
fn test_get_timeout_view_active_past_timeout() {
    // Funded escrow well past timeout: refundable must be true.
    let t = TestEnv::setup();
    let client = EscrowContractClient::new(&t.env, &t.escrow_contract_id);

    let escrow_id = deposit_escrow(&t, 1000, 100);
    let record = client.get_escrow(&escrow_id);

    t.env.ledger().set_sequence_number(record.timeout_ledger + 500);

    let view = client.get_timeout_view(&escrow_id);

    assert_eq!(view.timeout_ledger, record.timeout_ledger);
    assert!(view.current_ledger > view.timeout_ledger);
    assert!(view.refundable);
}

#[test]
fn test_get_timeout_view_released_state() {
    // Released escrow: refundable must be false regardless of ledger.
    let t = TestEnv::setup();
    let client = EscrowContractClient::new(&t.env, &t.escrow_contract_id);

    let escrow_id = deposit_escrow(&t, 1000, 100);
    client.release(&escrow_id, &t.buyer, &t.seller);

    // Advance past timeout to ensure the only reason for false is the terminal state.
    let record = client.get_escrow(&escrow_id);
    t.env.ledger().set_sequence_number(record.timeout_ledger + 10);

    let view = client.get_timeout_view(&escrow_id);

    assert_eq!(view.escrow_id, t.order_id());
    assert!(!view.refundable);
}

#[test]
fn test_get_timeout_view_refunded_state() {
    // Refunded escrow: refundable must be false.
    let t = TestEnv::setup();
    let client = EscrowContractClient::new(&t.env, &t.escrow_contract_id);

    let escrow_id = deposit_escrow(&t, 1000, 100);
    client.refund(&escrow_id, &t.seller);

    let record = client.get_escrow(&escrow_id);
    t.env.ledger().set_sequence_number(record.timeout_ledger + 10);

    let view = client.get_timeout_view(&escrow_id);

    assert_eq!(view.escrow_id, t.order_id());
    assert!(!view.refundable);
}

#[test]
fn test_get_timeout_view_disputed_state() {
    // Disputed escrow: refundable must be false even after timeout.
    let t = TestEnv::setup();
    let client = EscrowContractClient::new(&t.env, &t.escrow_contract_id);

    let escrow_id = deposit_escrow(&t, 1000, 100);
    client.dispute(&escrow_id, &t.buyer);

    let record = client.get_escrow(&escrow_id);
    t.env.ledger().set_sequence_number(record.timeout_ledger + 10);

    let view = client.get_timeout_view(&escrow_id);

    assert_eq!(view.escrow_id, t.order_id());
    assert!(!view.refundable);
}

#[test]
fn test_get_timeout_view_does_not_mutate_state() {
    // Calling the getter must not change the stored escrow record.
    let t = TestEnv::setup();
    let client = EscrowContractClient::new(&t.env, &t.escrow_contract_id);

    let escrow_id = deposit_escrow(&t, 1000, 100);
    let before = client.get_escrow(&escrow_id);

    // Call past timeout — a mutating refund would change the status.
    t.env.ledger().set_sequence_number(before.timeout_ledger + 5);
    let _view = client.get_timeout_view(&escrow_id);

    let after = client.get_escrow(&escrow_id);

    assert_eq!(before.status, after.status);
    assert_eq!(before.amount, after.amount);
    assert_eq!(before.timeout_ledger, after.timeout_ledger);
}

// ── Merchant Escrow Cancellation Integration Test ─────────────────────────

#[test]
fn test_cancellation_full_lifecycle() {
    let t = TestEnv::setup();
    let escrow_client = EscrowContractClient::new(&t.env, &t.escrow_contract_id);
    let token_client = soroban_sdk::token::Client::new(&t.env, &t.token_contract_id);

    let reason = symbol_short!("out_stock");

    // Merchant creates escrow without funding
    let escrow_id = escrow_client.create(
        &t.buyer,
        &t.seller,
        &t.token_contract_id,
        &1000i128,
        &t.order_id(),
        &100u32,
        &None,
        &None,
    );

    let record = escrow_client.get_escrow(&escrow_id);
    assert_eq!(record.status, EscrowStatus::Created);

    // Balances remain untouched
    assert_eq!(token_client.balance(&t.buyer), 10000);
    assert_eq!(token_client.balance(&t.escrow_contract_id), 0);

    // Merchant cancels escrow
    assert!(escrow_client.cancel(&escrow_id, &t.seller, &reason));

    let record_after = escrow_client.get_escrow(&escrow_id);
    assert_eq!(record_after.status, EscrowStatus::Cancelled);

    // Attempting to fund cancelled escrow fails
    assert_eq!(
        escrow_client.try_fund(&escrow_id, &t.buyer),
        Err(Ok(EscrowError::AlreadyCancelled))
    );

    // Attempting to release cancelled escrow fails
    assert_eq!(
        escrow_client.try_release(&escrow_id, &t.buyer, &t.seller),
        Err(Ok(EscrowError::AlreadyCancelled))
    );
}

// ── Escrow State Snapshot Tests (issue #329) ───────────────────────────────

#[test]
fn test_get_escrow_snapshot_not_found() {
    let t = TestEnv::setup();
    let client = EscrowContractClient::new(&t.env, &t.escrow_contract_id);

    let res = client.try_get_escrow_snapshot(&999u64);
    assert_eq!(res, Err(Ok(EscrowError::NotFound)));
}

#[test]
fn test_get_escrow_snapshot_returns_all_fields() {
    let t = TestEnv::setup();
    let client = EscrowContractClient::new(&t.env, &t.escrow_contract_id);

    let escrow_id = deposit_escrow(&t, 1000, 100);
    let record = client.get_escrow(&escrow_id);
    let fee_config = client.get_fee_config();

    let snapshot = client.get_escrow_snapshot(&escrow_id);

    assert_eq!(snapshot.record, record);
    assert_eq!(snapshot.fee_config, fee_config);
    assert_eq!(snapshot.current_ledger, t.env.ledger().sequence());
    assert!(!snapshot.timed_out);
    assert!(snapshot.release_eligible);
}

#[test]
fn test_get_escrow_snapshot_reflects_current_timeout_status() {
    let t = TestEnv::setup();
    let client = EscrowContractClient::new(&t.env, &t.escrow_contract_id);

    let escrow_id = deposit_escrow(&t, 1000, 100);
    let record = client.get_escrow(&escrow_id);

    t.env.ledger().set_sequence_number(record.timeout_ledger + 5);

    let snapshot = client.get_escrow_snapshot(&escrow_id);

    assert!(snapshot.timed_out);
    assert!(!snapshot.release_eligible);
    assert_eq!(snapshot.current_ledger, record.timeout_ledger + 5);
}

#[test]
fn test_get_escrow_snapshot_is_read_only() {
    let t = TestEnv::setup();
    let client = EscrowContractClient::new(&t.env, &t.escrow_contract_id);

    let escrow_id = deposit_escrow(&t, 1000, 100);
    let before = client.get_escrow(&escrow_id);

    t.env.ledger().set_sequence_number(before.timeout_ledger + 5);
    let _snapshot = client.get_escrow_snapshot(&escrow_id);

    let after = client.get_escrow(&escrow_id);
    assert_eq!(before.status, after.status);
    assert_eq!(before.amount, after.amount);
    assert_eq!(before.released_amount, after.released_amount);
}

// ── Escrow Compound Release / Yield Accrual Tests (issue #331) ────────────

#[test]
fn test_no_yield_config_means_zero_yield() {
    let t = TestEnv::setup();
    let client = EscrowContractClient::new(&t.env, &t.escrow_contract_id);

    let escrow_id = deposit_escrow(&t, 1000, 100);

    let view = client.get_accrued_yield(&escrow_id);
    assert_eq!(view.accrued_yield, 0);
    assert_eq!(view.apr_bps, 0);
}

#[test]
fn test_yield_calculation_for_30_day_escrow() {
    let t = TestEnv::setup();
    let client = EscrowContractClient::new(&t.env, &t.escrow_contract_id);

    let escrow_id = deposit_escrow(&t, 10_000, 100_000);
    let lending_contract = Address::generate(&t.env);

    // 10% APR.
    let apr_bps = 1_000u32;
    assert!(client.set_yield_config(&t.admin, &escrow_id, &lending_contract, &apr_bps));

    // Advance 30 days.
    let thirty_days_secs = 30 * 24 * 60 * 60;
    t.env.ledger().with_mut(|li| {
        li.timestamp += thirty_days_secs;
    });

    let view = client.get_accrued_yield(&escrow_id);
    // amount * apr_bps * held_seconds / (10_000 * seconds_per_year)
    let expected = (10_000i128 * apr_bps as i128 * thirty_days_secs as i128)
        / (10_000i128 * 31_536_000i128);
    assert_eq!(view.accrued_yield, expected);
    assert_eq!(view.apr_bps, apr_bps);
}

#[test]
fn test_yield_distribution_on_release() {
    let t = TestEnv::setup();
    let client = EscrowContractClient::new(&t.env, &t.escrow_contract_id);

    let escrow_id = deposit_escrow(&t, 10_000, 100_000);
    let lending_contract = Address::generate(&t.env);
    let apr_bps = 1_000u32;
    client.set_yield_config(&t.admin, &escrow_id, &lending_contract, &apr_bps);

    let thirty_days_secs = 30 * 24 * 60 * 60;
    t.env.ledger().with_mut(|li| {
        li.timestamp += thirty_days_secs;
    });

    let expected_yield = client.get_accrued_yield(&escrow_id).accrued_yield;
    assert!(expected_yield > 0);

    assert!(client.release(&escrow_id, &t.buyer, &t.seller));

    let events = t.env.events().all();
    let mut found = false;
    for event in events.iter() {
        let (contract, topics, value) = event;
        if contract != t.escrow_contract_id || topics.len() != 2 {
            continue;
        }
        let t0: soroban_sdk::Symbol = topics.get(0).unwrap().into_val(&t.env);
        let t1: soroban_sdk::Symbol = topics.get(1).unwrap().into_val(&t.env);
        if t0 == symbol_short!("escrow") && t1 == symbol_short!("yield") {
            let decoded: crate::EscrowYieldAccruedEvent = value.into_val(&t.env);
            assert_eq!(decoded.escrow_id, escrow_id);
            assert_eq!(decoded.seller, t.seller);
            assert_eq!(decoded.yield_amount, expected_yield);
            assert_eq!(decoded.held_seconds, thirty_days_secs);
            found = true;
        }
    }
    assert!(found, "EscrowYieldAccruedEvent not found in events");
}

#[test]
fn test_set_yield_config_rejects_invalid_apr() {
    let t = TestEnv::setup();
    let client = EscrowContractClient::new(&t.env, &t.escrow_contract_id);

    let escrow_id = deposit_escrow(&t, 1000, 100);
    let lending_contract = Address::generate(&t.env);

    assert_eq!(
        client.try_set_yield_config(&t.admin, &escrow_id, &lending_contract, &10_001u32),
        Err(Ok(EscrowError::InvalidYieldConfig))
    );
}
