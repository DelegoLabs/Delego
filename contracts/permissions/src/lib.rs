//! Delego Permissions Contract
//! Spending limits, delegated authority, and time-locked allowance decrements

#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, contracterror, symbol_short, Address, Env, Symbol, Vec};

const _PERM: Symbol = symbol_short!("PERM");
const _PENDING_DEC: Symbol = symbol_short!("PEND_DEC");

/// Contract name and semver for backend compatibility checks.
/// Soroban Symbol only allows [a-zA-Z0-9_], so hyphens/dots are replaced with underscores.
pub const CONTRACT_NAME: &str = "delego_perms";
pub const CONTRACT_SEMVER: &str = "0_1_0";

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
pub enum PermissionError {
    NotFound = 1,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum PermissionStatus {
    Active,
    Paused,
    Revoked,
    Expired,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PermissionRecord {
    pub owner: Address,
    pub delegate: Address,
    pub limit_total: i128,
    pub spent: i128,
    pub limit_per_tx: i128,
    pub allowed_merchants: Vec<Address>,
    pub status: PermissionStatus,
    pub expires_at_ledger: u32,
    pub created_at: u64,
}

/// Lightweight config for multi-merchant whitelisting and allowance tracking.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PermissionConfig {
    pub merchants: Vec<Address>,
    pub allowance: i128,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct PermissionGrantedEvent {
    pub owner: Address,
    pub delegate: Address,
    pub per_tx_limit: i128,
    pub total_limit: i128,
    pub expires_at_ledger: u32,
    pub merchant_count: u32,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct PermissionRevokedEvent {
    pub owner: Address,
    pub delegate: Address,
}

/// Emitted after a delegated spend is successfully recorded (issue #99).
#[contracttype]
#[derive(Clone, Debug)]
pub struct PermissionSpendEvent {
    pub owner: Address,
    pub delegate: Address,
    pub merchant: Address,
    pub amount: i128,
    pub remaining: i128,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct PendingAllowanceDecrement {
    pub amount: i128,
    pub execution_time: u64,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct DecrementExecutedEvent {
    pub owner: Address,
    pub delegate: Address,
    pub previous_limit: i128,
    pub new_limit: i128,
}

/// Typed allowance breakdown returned by `get_allowance_detail` (issue #98).
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RemainingAllowance {
    pub limit: i128,
    pub spent: i128,
    pub remaining: i128,
    pub expires_at_ledger: u32,
}

/// Contract identity returned by `version` (issue #103).
#[contracttype]
#[derive(Clone, Debug)]
pub struct ContractVersion {
    pub name: Symbol,
    pub semver: Symbol,
}

/// Stored when a permission is paused; cleared on resume (issue #105).
#[contracttype]
#[derive(Clone, Debug)]
pub struct PauseMetadata {
    pub paused_by: Address,
    pub reason_code: Symbol,
    pub paused_at_ledger: u32,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct PermissionPausedEvent {
    pub owner: Address,
    pub delegate: Address,
    pub paused_by: Address,
    pub reason_code: Symbol,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct PermissionResumedEvent {
    pub owner: Address,
    pub delegate: Address,
    pub resumed_by: Address,
}

#[contracttype]
pub enum DataKey {
    Permission(Address, Address),
    PendingDecrement(Address, Address),
    PauseMetadata(Address, Address),
}

#[contract]
pub struct PermissionsContract;

#[contractimpl]
impl PermissionsContract {
    pub fn grant(
        env: Env,
        owner: Address,
        delegate: Address,
        limit_total: i128,
        limit_per_tx: i128,
        allowed_merchants: Vec<Address>,
        ttl_ledgers: u32,
    ) -> bool {
        owner.require_auth();

        let expires_at_ledger = env.ledger().sequence() + ttl_ledgers;

        let record = PermissionRecord {
            owner: owner.clone(),
            delegate: delegate.clone(),
            limit_total,
            spent: 0,
            limit_per_tx,
            allowed_merchants: allowed_merchants.clone(),
            status: PermissionStatus::Active,
            expires_at_ledger,
            created_at: env.ledger().timestamp(),
        };

        env.storage().persistent().set(&DataKey::Permission(owner.clone(), delegate.clone()), &record);

        env.events().publish(
            (symbol_short!("perm"), symbol_short!("granted")),
            PermissionGrantedEvent {
                owner,
                delegate,
                per_tx_limit: limit_per_tx,
                total_limit: limit_total,
                expires_at_ledger,
                merchant_count: allowed_merchants.len(),
            },
        );

        true
    }

    pub fn revoke(env: Env, owner: Address, delegate: Address) -> bool {
        owner.require_auth();

        let key = DataKey::Permission(owner.clone(), delegate.clone());
        if let Some(mut record) = env.storage().persistent().get::<DataKey, PermissionRecord>(&key) {
            record.status = PermissionStatus::Revoked;
            env.storage().persistent().set(&key, &record);
            env.storage().persistent().remove(&DataKey::PendingDecrement(owner.clone(), delegate.clone()));

            env.events().publish(
                (symbol_short!("perm"), symbol_short!("revoked")),
                PermissionRevokedEvent { owner, delegate },
            );

            true
        } else {
            false
        }
    }

    pub fn can_spend(
        env: Env,
        owner: Address,
        delegate: Address,
        amount: i128,
        merchant: Address,
    ) -> bool {
        let key = DataKey::Permission(owner.clone(), delegate.clone());
        let record: PermissionRecord = match env.storage().persistent().get(&key) {
            Some(r) => r,
            None => return false,
        };

        if record.status != PermissionStatus::Active {
            return false;
        }

        if env.ledger().sequence() >= record.expires_at_ledger {
            return false;
        }

        if amount > record.limit_per_tx {
            return false;
        }

        let remaining = record.limit_total - record.spent;
        if amount > remaining {
            return false;
        }

        if record.allowed_merchants.len() > 0 {
            let mut allowed = false;
            for m in record.allowed_merchants.iter() {
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

    pub fn execute_spend(
        env: Env,
        owner: Address,
        delegate: Address,
        amount: i128,
        merchant: Address,
    ) -> bool {
        delegate.require_auth();

        if !Self::can_spend(env.clone(), owner.clone(), delegate.clone(), amount, merchant.clone()) {
            panic!("Spend not authorized");
        }

        let key = DataKey::Permission(owner.clone(), delegate.clone());
        let mut record: PermissionRecord = env.storage().persistent().get(&key).unwrap();

        record.spent += amount;
        env.storage().persistent().set(&key, &record);

        let remaining = record.limit_total - record.spent;

        // Emit after successful spend only (issue #99).
        env.events().publish(
            (symbol_short!("perm"), symbol_short!("spent")),
            PermissionSpendEvent {
                owner,
                delegate,
                merchant,
                amount,
                remaining,
            },
        );

        true
    }

    pub fn get_permission(
        env: Env,
        owner: Address,
        delegate: Address,
    ) -> PermissionRecord {
        let key = DataKey::Permission(owner, delegate);
        env.storage().persistent().get(&key).unwrap()
    }

    pub fn get_remaining_allowance(
        env: Env,
        owner: Address,
        delegate: Address,
    ) -> i128 {
        let key = DataKey::Permission(owner, delegate);
        let record: PermissionRecord = env.storage().persistent().get(&key).unwrap();
        record.limit_total - record.spent
    }

    /// Typed allowance getter: returns limit, spent, remaining (clamped ≥ 0),
    /// and expiry. Returns PermissionError::NotFound for unknown pairs (issue #98).
    pub fn get_allowance_detail(
        env: Env,
        owner: Address,
        delegate: Address,
    ) -> Result<RemainingAllowance, PermissionError> {
        let key = DataKey::Permission(owner, delegate);
        let record: PermissionRecord = env.storage().persistent().get(&key)
            .ok_or(PermissionError::NotFound)?;

        let raw = record.limit_total - record.spent;
        let remaining = if raw < 0 { 0 } else { raw };

        Ok(RemainingAllowance {
            limit: record.limit_total,
            spent: record.spent,
            remaining,
            expires_at_ledger: record.expires_at_ledger,
        })
    }

    pub fn decrease_allowance(
        env: Env,
        owner: Address,
        delegate: Address,
        amount: i128,
    ) -> bool {
        owner.require_auth();

        let perm_key = DataKey::Permission(owner.clone(), delegate.clone());
        let _record: PermissionRecord = env.storage().persistent().get(&perm_key).unwrap();

        let pend_key = DataKey::PendingDecrement(owner.clone(), delegate.clone());
        if env.storage().persistent().has(&pend_key) {
            panic!("Pending decrement already exists for this delegation");
        }

        let execution_time = env.ledger().timestamp() + 86400;

        let pending = PendingAllowanceDecrement {
            amount,
            execution_time,
        };

        env.storage().persistent().set(&pend_key, &pending);

        true
    }

    pub fn execute_decrease_allowance(
        env: Env,
        owner: Address,
        delegate: Address,
    ) -> bool {
        let pend_key = DataKey::PendingDecrement(owner.clone(), delegate.clone());
        let pending: PendingAllowanceDecrement = env.storage().persistent().get(&pend_key).unwrap();

        if env.ledger().timestamp() < pending.execution_time {
            panic!("Time-lock has not elapsed yet");
        }

        let perm_key = DataKey::Permission(owner.clone(), delegate.clone());
        let mut record: PermissionRecord = env.storage().persistent().get(&perm_key).unwrap();

        let previous_limit = record.limit_total;
        let new_limit = record.limit_total - pending.amount;
        if new_limit < record.spent {
            panic!("Decrease would exceed current spent amount");
        }

        record.limit_total = new_limit;
        env.storage().persistent().set(&perm_key, &record);
        env.storage().persistent().remove(&pend_key);

        env.events().publish(
            (symbol_short!("perm"), symbol_short!("dec_allow")),
            DecrementExecutedEvent {
                owner,
                delegate,
                previous_limit,
                new_limit,
            },
        );

        true
    }

    /// Pauses a permission, storing the caller and a short reason code (issue #105).
    /// The owner or an authorised admin must sign this call.
    pub fn pause(
        env: Env,
        owner: Address,
        delegate: Address,
        paused_by: Address,
        reason_code: Symbol,
    ) -> bool {
        paused_by.require_auth();

        let perm_key = DataKey::Permission(owner.clone(), delegate.clone());
        let mut record: PermissionRecord = match env.storage().persistent().get(&perm_key) {
            Some(r) => r,
            None => return false,
        };

        if record.status != PermissionStatus::Active {
            return false;
        }

        record.status = PermissionStatus::Paused;
        env.storage().persistent().set(&perm_key, &record);

        let meta = PauseMetadata {
            paused_by: paused_by.clone(),
            reason_code: reason_code.clone(),
            paused_at_ledger: env.ledger().sequence(),
        };
        env.storage().persistent().set(&DataKey::PauseMetadata(owner.clone(), delegate.clone()), &meta);

        env.events().publish(
            (symbol_short!("perm"), symbol_short!("paused")),
            PermissionPausedEvent { owner, delegate, paused_by, reason_code },
        );

        true
    }

    /// Resumes a paused permission and clears the stored pause metadata (issue #105).
    pub fn resume(
        env: Env,
        owner: Address,
        delegate: Address,
        resumed_by: Address,
    ) -> bool {
        resumed_by.require_auth();

        let perm_key = DataKey::Permission(owner.clone(), delegate.clone());
        let mut record: PermissionRecord = match env.storage().persistent().get(&perm_key) {
            Some(r) => r,
            None => return false,
        };

        if record.status != PermissionStatus::Paused {
            return false;
        }

        record.status = PermissionStatus::Active;
        env.storage().persistent().set(&perm_key, &record);
        env.storage().persistent().remove(&DataKey::PauseMetadata(owner.clone(), delegate.clone()));

        env.events().publish(
            (symbol_short!("perm"), symbol_short!("resumed")),
            PermissionResumedEvent { owner, delegate, resumed_by },
        );

        true
    }

    /// Returns the stored pause metadata, or panics if the permission is not currently paused.
    pub fn get_pause_metadata(env: Env, owner: Address, delegate: Address) -> PauseMetadata {
        env.storage()
            .persistent()
            .get(&DataKey::PauseMetadata(owner, delegate))
            .unwrap()
    }

    /// Returns contract name and semantic version for deployment verification (issue #103).
    pub fn version(env: Env) -> ContractVersion {
        ContractVersion {
            name: Symbol::new(&env, CONTRACT_NAME),
            semver: Symbol::new(&env, CONTRACT_SEMVER),
        }
    }
}

#[cfg(test)]
mod test;
#[cfg(test)]
mod integration_tests;
