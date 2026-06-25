#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, Address, BytesN, Env, Symbol, Vec};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DelegationStatus {
    Pending,
    Active,
    Paused,
    Revoked,
    Expired,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DelegationRecord {
    pub id: u64,
    pub owner: Address,
    pub agent_id: BytesN<32>,
    pub permissions_contract: Address,
    pub status: DelegationStatus,
    pub label: Symbol,
    pub created_at: u64,
    pub expires_at_ledger: u32,
}

#[contracttype]
pub enum DataKey {
    Admin,
    NextId,
    Delegation(u64),
    UserDelegations(Address),
}

#[contract]
pub struct DelegationRegistry;

#[contractimpl]
impl DelegationRegistry {
    pub fn initialize(env: Env, admin: Address) -> bool {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("Contract already initialized");
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::NextId, &1u64);
        true
    }

    pub fn create_delegation(
        env: Env,
        owner: Address,
        agent_id: BytesN<32>,
        permissions_contract: Address,
        label: Symbol,
        ttl_ledgers: u32,
    ) -> u64 {
        owner.require_auth();

        let id = env.storage().instance().get(&DataKey::NextId).unwrap_or(1u64);
        env.storage().instance().set(&DataKey::NextId, &(id + 1));

        let expires_at_ledger = env.ledger().sequence() + ttl_ledgers;

        let record = DelegationRecord {
            id,
            owner: owner.clone(),
            agent_id,
            permissions_contract,
            status: DelegationStatus::Active,
            label,
            created_at: env.ledger().timestamp(),
            expires_at_ledger,
        };

        env.storage().persistent().set(&DataKey::Delegation(id), &record);

        let mut user_dels = env
            .storage()
            .persistent()
            .get::<_, Vec<u64>>(&DataKey::UserDelegations(owner.clone()))
            .unwrap_or(Vec::new(&env));
            
        user_dels.push_back(id);
        env.storage().persistent().set(&DataKey::UserDelegations(owner), &user_dels);

        id
    }

    pub fn pause_delegation(env: Env, delegation_id: u64) -> bool {
        let mut record: DelegationRecord = env
            .storage()
            .persistent()
            .get(&DataKey::Delegation(delegation_id))
            .expect("Delegation not found");

        record.owner.require_auth();

        if record.status != DelegationStatus::Active {
            panic!("Can only pause an active delegation");
        }

        record.status = DelegationStatus::Paused;
        env.storage().persistent().set(&DataKey::Delegation(delegation_id), &record);
        true
    }

    pub fn resume_delegation(env: Env, delegation_id: u64) -> bool {
        let mut record: DelegationRecord = env
            .storage()
            .persistent()
            .get(&DataKey::Delegation(delegation_id))
            .expect("Delegation not found");

        record.owner.require_auth();

        if record.status != DelegationStatus::Paused {
            panic!("Can only resume a paused delegation");
        }

        if env.ledger().sequence() >= record.expires_at_ledger {
            record.status = DelegationStatus::Expired;
            env.storage().persistent().set(&DataKey::Delegation(delegation_id), &record);
            panic!("Delegation has already expired");
        }

        record.status = DelegationStatus::Active;
        env.storage().persistent().set(&DataKey::Delegation(delegation_id), &record);
        true
    }

    pub fn revoke_delegation(env: Env, delegation_id: u64) -> bool {
        let mut record: DelegationRecord = env
            .storage()
            .persistent()
            .get(&DataKey::Delegation(delegation_id))
            .expect("Delegation not found");

        record.owner.require_auth();

        if record.status == DelegationStatus::Revoked {
            return true;
        }

        record.status = DelegationStatus::Revoked;
        env.storage().persistent().set(&DataKey::Delegation(delegation_id), &record);
        true
    }

    pub fn get_delegation(env: Env, delegation_id: u64) -> DelegationRecord {
        env.storage()
            .persistent()
            .get(&DataKey::Delegation(delegation_id))
            .expect("Delegation not found")
    }

    pub fn get_delegations_by_owner(env: Env, owner: Address) -> Vec<DelegationRecord> {
        let user_dels = env
            .storage()
            .persistent()
            .get::<_, Vec<u64>>(&DataKey::UserDelegations(owner))
            .unwrap_or(Vec::new(&env));

        let mut records = Vec::new(&env);
        for id in user_dels.iter() {
            if let Some(record) = env.storage().persistent().get::<_, DelegationRecord>(&DataKey::Delegation(id)) {
                records.push_back(record);
            }
        }
        records
    }

    pub fn is_authorized(env: Env, delegation_id: u64, agent_id: BytesN<32>) -> bool {
        let record: DelegationRecord = match env.storage().persistent().get(&DataKey::Delegation(delegation_id)) {
            Some(r) => r,
            None => return false,
        };

        if record.status != DelegationStatus::Active {
            return false;
        }

        if env.ledger().sequence() >= record.expires_at_ledger {
            return false;
        }

        if record.agent_id != agent_id {
            return false;
        }

        true
    }
}

#[cfg(test)]
mod test;