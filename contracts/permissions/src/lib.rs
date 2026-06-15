//! Delego Permissions Contract
//! Spending limits and delegated authority for AI agents

#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, Address, Env, Symbol, Vec};

const PERM: Symbol = symbol_short!("PERM");

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PermissionInfo {
    pub per_tx_limit: i128,
    pub total_limit: i128,
    pub expiry_timestamp: u64,
    pub allowed_merchants: Vec<Address>,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct PermissionGrantedEvent {
    pub owner: Address,
    pub delegate: Address,
    pub per_tx_limit: i128,
    pub total_limit: i128,
    pub expiry_timestamp: u64,
    pub merchant_count: u32,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct PermissionRevokedEvent {
    pub owner: Address,
    pub delegate: Address,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct SpendExecutedEvent {
    pub owner: Address,
    pub delegate: Address,
    pub amount: i128,
    pub merchant: Address,
    pub remaining_allowance: i128,
}

#[contracttype]
pub enum DataKey {
    Permission(Address, Address), // (owner, delegate)
}

#[contract]
pub struct PermissionsContract;

#[contractimpl]
impl PermissionsContract {
    /// Grant spending permission to a delegate (agent).
    pub fn grant(
        env: Env,
        owner: Address,
        delegate: Address,
        per_tx_limit: i128,
        total_limit: i128,
        expiry_timestamp: u64,
        allowed_merchants: Vec<Address>,
    ) -> bool {
        owner.require_auth();

        let info = PermissionInfo {
            per_tx_limit,
            total_limit,
            expiry_timestamp,
            allowed_merchants,
        };

        env.storage().persistent().set(&DataKey::Permission(owner.clone(), delegate.clone()), &info);

        env.events().publish(
            (symbol_short!("perm"), symbol_short!("granted")),
            PermissionGrantedEvent {
                owner,
                delegate,
                per_tx_limit: info.per_tx_limit,
                total_limit: info.total_limit,
                expiry_timestamp: info.expiry_timestamp,
                merchant_count: info.allowed_merchants.len(),
            },
        );

        true
    }

    /// Revoke a delegate's permission.
    pub fn revoke(env: Env, owner: Address, delegate: Address) -> bool {
        owner.require_auth();

        let key = DataKey::Permission(owner.clone(), delegate.clone());
        if env.storage().persistent().has(&key) {
            env.storage().persistent().remove(&key);

            env.events().publish(
                (symbol_short!("perm"), symbol_short!("revoked")),
                PermissionRevokedEvent {
                    owner,
                    delegate,
                },
            );

            true
        } else {
            false
        }
    }

    /// Check if delegate may spend amount on behalf of owner.
    pub fn can_spend(
        env: Env,
        owner: Address,
        delegate: Address,
        amount: i128,
        merchant: Address,
    ) -> bool {
        let key = DataKey::Permission(owner.clone(), delegate.clone());
        let info: PermissionInfo = match env.storage().persistent().get(&key) {
            Some(i) => i,
            None => return false,
        };

        // Check expiry
        if env.ledger().timestamp() >= info.expiry_timestamp {
            return false;
        }

        // Check transaction limit
        if amount > info.per_tx_limit {
            return false;
        }

        // Check remaining total limit
        if amount > info.total_limit {
            return false;
        }

        // Check merchant restriction
        if info.allowed_merchants.len() > 0 {
            let mut allowed = false;
            for m in info.allowed_merchants.iter() {
                if m == merchant {
                    allowed = true;
                    break;
                }
            }
            if !allowed {
                return false;
            }
        }

        true
    }

    /// Execute a spend, decrementing the total allowance.
    pub fn execute_spend(
        env: Env,
        owner: Address,
        delegate: Address,
        amount: i128,
        merchant: Address,
    ) -> bool {
        // The delegate or owner triggers the spend.
        delegate.require_auth();

        if !Self::can_spend(env.clone(), owner.clone(), delegate.clone(), amount, merchant.clone()) {
            panic!("Spend not authorized");
        }

        let key = DataKey::Permission(owner.clone(), delegate.clone());
        let mut info: PermissionInfo = env.storage().persistent().get(&key).unwrap();

        info.total_limit -= amount;
        env.storage().persistent().set(&key, &info);

        env.events().publish(
            (symbol_short!("perm"), symbol_short!("spent")),
            SpendExecutedEvent {
                owner,
                delegate,
                amount,
                merchant,
                remaining_allowance: info.total_limit,
            },
        );

        true
    }
}

#[cfg(test)]
mod test;
#[cfg(test)]
mod integration_tests;
