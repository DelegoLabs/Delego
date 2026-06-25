#![cfg(test)]

use super::*;
use soroban_sdk::{testutils::{Address as _, Ledger}, Address, BytesN, Env, Symbol};

fn setup() -> (Env, DelegationRegistryClient<'static>, Address, Address, BytesN<32>, Address) {
    let env = Env::default();
    let contract_id = env.register(DelegationRegistry, ());
    let client = DelegationRegistryClient::new(&env, &contract_id);
    
    let admin = Address::generate(&env);
    let owner = Address::generate(&env);
    let agent_id = BytesN::from_array(&env, &[1; 32]);
    let permissions_contract = Address::generate(&env);
    
    client.initialize(&admin);
    
    (env, client, admin, owner, agent_id, permissions_contract)
}

#[test]
fn test_full_lifecycle() {
    let (env, client, _, owner, agent_id, permissions_contract) = setup();
    env.mock_all_auths();
    
    let label = Symbol::new(&env, "Agent_X");
    
    let id = client.create_delegation(&owner, &agent_id, &permissions_contract, &label, &1000);
    assert_eq!(id, 1);
    
    let record = client.get_delegation(&id);
    assert_eq!(record.status, DelegationStatus::Active);
    assert_eq!(client.is_authorized(&id, &agent_id), true);
    
    client.pause_delegation(&id);
    let record = client.get_delegation(&id);
    assert_eq!(record.status, DelegationStatus::Paused);
    assert_eq!(client.is_authorized(&id, &agent_id), false);
    
    client.resume_delegation(&id);
    let record = client.get_delegation(&id);
    assert_eq!(record.status, DelegationStatus::Active);
    assert_eq!(client.is_authorized(&id, &agent_id), true);
    
    client.revoke_delegation(&id);
    let record = client.get_delegation(&id);
    assert_eq!(record.status, DelegationStatus::Revoked);
    assert_eq!(client.is_authorized(&id, &agent_id), false);
}

#[test]
fn test_expiry_behavior() {
    let (env, client, _, owner, agent_id, permissions_contract) = setup();
    env.mock_all_auths();
    
    env.ledger().set_sequence_number(100);
    let label = Symbol::new(&env, "Agent_Y");
    
    let id = client.create_delegation(&owner, &agent_id, &permissions_contract, &label, &100);
    assert_eq!(client.is_authorized(&id, &agent_id), true);
    
    env.ledger().set_sequence_number(200);
    assert_eq!(client.is_authorized(&id, &agent_id), false);
}

#[test]
#[should_panic]
fn test_unauthorized_access() {
    let (env, client, _, owner, agent_id, permissions_contract) = setup();
    let label = Symbol::new(&env, "Agent_Z");
    
    client.create_delegation(&owner, &agent_id, &permissions_contract, &label, &100);
}

#[test]
#[should_panic(expected = "Can only resume a paused delegation")]
fn test_resume_active_fails() {
    let (env, client, _, owner, agent_id, permissions_contract) = setup();
    env.mock_all_auths();
    
    let label = Symbol::new(&env, "Agent_Y");
    let id = client.create_delegation(&owner, &agent_id, &permissions_contract, &label, &100);
    
    client.resume_delegation(&id);
}

#[test]
fn test_multiple_delegations_per_owner() {
    let (env, client, _, owner, agent_id, permissions_contract) = setup();
    env.mock_all_auths();
    
    let label1 = Symbol::new(&env, "Shopping");
    let label2 = Symbol::new(&env, "Trading");
    
    client.create_delegation(&owner, &agent_id, &permissions_contract, &label1, &100);
    client.create_delegation(&owner, &agent_id, &permissions_contract, &label2, &100);
    
    let dels = client.get_delegations_by_owner(&owner);
    assert_eq!(dels.len(), 2);
    assert_eq!(dels.get(0).unwrap().label, label1);
    assert_eq!(dels.get(1).unwrap().label, label2);
}