//! Delego Permissions Contract
//! Spending limits, delegated authority, and time-locked allowance decrements

#![no_std]
use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, symbol_short, Address, BytesN, Env,
    Symbol, Vec,
};

const _PERM: Symbol = symbol_short!("PERM");
const _PENDING_DEC: Symbol = symbol_short!("PEND_DEC");

/// Contract name and semver for backend compatibility checks.
/// Soroban Symbol only allows [a-zA-Z0-9_], so hyphens/dots are replaced with underscores.
pub const CONTRACT_NAME: &str = "delego_perms";
pub const CONTRACT_SEMVER: &str = "0_1_0";

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum PermissionError {
    /// No permission record found for this owner/delegate pair
    NotFound = 1,
    /// Permission has expired
    Expired = 2,
    /// Amount exceeds per-transaction limit
    ExceedsPerTxLimit = 3,
    /// Amount exceeds remaining total allowance
    ExceedsTotalLimit = 4,
    /// Merchant is not in the allowed merchants list
    MerchantNotAllowed = 5,
    /// Caller is not authorized (not the owner)
    Unauthorized = 6,
    /// Invalid parameter (zero limit, etc.)
    InvalidParam = 7,
    /// Permission is currently paused
    PermissionPaused = 8,
    /// Permission is already paused
    AlreadyPaused = 9,
    /// Permission is already active
    AlreadyActive = 10,
    /// New grants are globally paused by admin
    GrantsPaused = 11,
    /// Owner and delegate cannot be the same address
    SelfDelegationNotAllowed = 401,
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

/// Global pause state for new permission grants (issue #186).
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PermissionPauseState {
    pub grants_paused: bool,
    pub updated_at_ledger: u32,
}

/// Emitted when the global grant pause state changes (issue #186).
#[contracttype]
#[derive(Clone, Debug)]
pub struct GrantPauseChangedEvent {
    pub grants_paused: bool,
    pub changed_by: Address,
    pub ledger: u32,
}

/// Emitted when an allowance decrease is successfully applied (issue #189).
#[contracttype]
#[derive(Clone, Debug)]
pub struct AllowanceDecreasedEvent {
    pub owner: Address,
    pub delegate: Address,
    pub old_limit: i128,
    pub new_limit: i128,
}

/// Compact receipt returned after a successful grant (issue #180).
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PermissionReceipt {
    pub owner: Address,
    pub delegate: Address,
    pub limit: i128,
    pub expires_at_ledger: u32,
    pub active: bool,
}

/// Optional metadata linking on-chain policy to off-chain descriptions (issue #181).
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PermissionMetadata {
    pub policy_hash: BytesN<32>,
    pub schema: Symbol,
}

#[contracttype]
pub enum DataKey {
    Permission(Address, Address),
    PendingDecrement(Address, Address),
    PauseMetadata(Address, Address),
    Admin,
    GrantPauseState,
    Metadata(Address, Address),
    /// Instance-level flag: when true, grant() allows owner == delegate.
    AllowSelfDelegation,
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
    ) -> Result<(), PermissionError> {
        owner.require_auth();

        // Issue #186: block new grants when globally paused
        if let Some(state) = env
            .storage()
            .instance()
            .get::<DataKey, PermissionPauseState>(&DataKey::GrantPauseState)
        {
            if state.grants_paused {
                return Err(PermissionError::GrantsPaused);
            }
        }

        // Reject self-delegation unless the contract config explicitly allows it (issue #182).
        let allow_self: bool = env
            .storage()
            .instance()
            .get(&DataKey::AllowSelfDelegation)
            .unwrap_or(false);
        if !allow_self && owner == delegate {
            return Err(PermissionError::SelfDelegationNotAllowed);
        }

        // Reject nonsensical limits: per-tx must be positive and the total
        // allowance must be at least one full per-tx spend.
        if limit_per_tx <= 0 || limit_total < limit_per_tx {
            return Err(PermissionError::InvalidParam);
        }

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

        env.storage().persistent().set(
            &DataKey::Permission(owner.clone(), delegate.clone()),
            &record,
        );

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

        Ok(())
    }

    pub fn revoke(env: Env, owner: Address, delegate: Address) -> Result<(), PermissionError> {
        owner.require_auth();

        let key = DataKey::Permission(owner.clone(), delegate.clone());
        if let Some(mut record) = env
            .storage()
            .persistent()
            .get::<DataKey, PermissionRecord>(&key)
        {
            record.status = PermissionStatus::Revoked;
            env.storage().persistent().set(&key, &record);
            env.storage()
                .persistent()
                .remove(&DataKey::PendingDecrement(owner.clone(), delegate.clone()));

            env.events().publish(
                (symbol_short!("perm"), symbol_short!("revoked")),
                PermissionRevokedEvent { owner, delegate },
            );

            Ok(())
        } else {
            Err(PermissionError::NotFound)
        }
    }

    pub fn can_spend(
        env: Env,
        owner: Address,
        delegate: Address,
        amount: i128,
        merchant: Address,
    ) -> Result<(), PermissionError> {
        let key = DataKey::Permission(owner.clone(), delegate.clone());
        let record: PermissionRecord = match env.storage().persistent().get(&key) {
            Some(r) => r,
            None => return Err(PermissionError::NotFound),
        };

        match record.status {
            PermissionStatus::Active => {}
            PermissionStatus::Paused => return Err(PermissionError::PermissionPaused),
            PermissionStatus::Expired => return Err(PermissionError::Expired),
            PermissionStatus::Revoked => return Err(PermissionError::Unauthorized),
        }

        if env.ledger().sequence() >= record.expires_at_ledger {
            return Err(PermissionError::Expired);
        }

        if amount > record.limit_per_tx {
            return Err(PermissionError::ExceedsPerTxLimit);
        }

        let remaining = record.limit_total - record.spent;
        if amount > remaining {
            return Err(PermissionError::ExceedsTotalLimit);
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
                return Err(PermissionError::MerchantNotAllowed);
            }
        }

        Ok(())
    }

    pub fn execute_spend(
        env: Env,
        owner: Address,
        delegate: Address,
        amount: i128,
        merchant: Address,
    ) -> Result<(), PermissionError> {
        delegate.require_auth();

        // Propagate the precise reason (expired, over-limit, wrong merchant, …)
        // to the caller instead of panicking with an opaque string.
        Self::can_spend(
            env.clone(),
            owner.clone(),
            delegate.clone(),
            amount,
            merchant.clone(),
        )?;

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

        Ok(())
    }

    pub fn get_permission(env: Env, owner: Address, delegate: Address) -> PermissionRecord {
        let key = DataKey::Permission(owner, delegate);
        env.storage().persistent().get(&key).unwrap()
    }

    pub fn get_remaining_allowance(env: Env, owner: Address, delegate: Address) -> i128 {
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
        let record: PermissionRecord = env
            .storage()
            .persistent()
            .get(&key)
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

    pub fn decrease_allowance(env: Env, owner: Address, delegate: Address, amount: i128) -> bool {
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

    pub fn execute_decrease_allowance(env: Env, owner: Address, delegate: Address) -> bool {
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
            (symbol_short!("perm"), symbol_short!("allowdec")),
            AllowanceDecreasedEvent {
                owner,
                delegate,
                old_limit: previous_limit,
                new_limit,
            },
        );

        true
    }

    pub fn pause(env: Env, owner: Address, delegate: Address) -> Result<(), PermissionError> {
        owner.require_auth();

        let perm_key = DataKey::Permission(owner.clone(), delegate.clone());
        let mut record: PermissionRecord = match env.storage().persistent().get(&perm_key) {
            Some(r) => r,
            None => return Err(PermissionError::NotFound),
        };

        if record.status != PermissionStatus::Active {
            return Err(PermissionError::AlreadyPaused);
        }

        record.status = PermissionStatus::Paused;
        env.storage().persistent().set(&perm_key, &record);

        env.events().publish(
            (symbol_short!("perm"), symbol_short!("paused")),
            PermissionPausedEvent {
                owner: owner.clone(),
                delegate: delegate.clone(),
                paused_by: owner.clone(),
                reason_code: symbol_short!("none"),
            },
        );

        Ok(())
    }

    pub fn resume(env: Env, owner: Address, delegate: Address) -> Result<(), PermissionError> {
        owner.require_auth();

        let perm_key = DataKey::Permission(owner.clone(), delegate.clone());
        let mut record: PermissionRecord = match env.storage().persistent().get(&perm_key) {
            Some(r) => r,
            None => return Err(PermissionError::NotFound),
        };

        if record.status == PermissionStatus::Active {
            return Err(PermissionError::AlreadyActive);
        }

        record.status = PermissionStatus::Active;
        env.storage().persistent().set(&perm_key, &record);

        env.events().publish(
            (symbol_short!("perm"), symbol_short!("resumed")),
            PermissionResumedEvent {
                owner: owner.clone(),
                delegate,
                resumed_by: owner,
            },
        );

        Ok(())
    }

    /// Returns the stored pause metadata, or panics if the permission is not currently paused.
    pub fn get_pause_metadata(env: Env, owner: Address, delegate: Address) -> PauseMetadata {
        env.storage()
            .persistent()
            .get(&DataKey::PauseMetadata(owner, delegate))
            .unwrap()
    }

    pub fn set_admin(env: Env, admin: Address) {
        admin.require_auth();
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("Admin already set");
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
    }

    /// Pause new grant creation. Admin-only.
    pub fn pause_grants(env: Env, admin: Address) -> Result<(), PermissionError> {
        admin.require_auth();
        let stored_admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .expect("Admin not set");
        if admin != stored_admin {
            return Err(PermissionError::Unauthorized);
        }

        let state = PermissionPauseState {
            grants_paused: true,
            updated_at_ledger: env.ledger().sequence(),
        };
        env.storage().instance().set(&DataKey::GrantPauseState, &state);

        env.events().publish(
            (symbol_short!("perm"), symbol_short!("gpaused")),
            GrantPauseChangedEvent {
                grants_paused: true,
                changed_by: admin,
                ledger: state.updated_at_ledger,
            },
        );

        Ok(())
    }

    /// Unpause new grant creation. Admin-only.
    pub fn unpause_grants(env: Env, admin: Address) -> Result<(), PermissionError> {
        admin.require_auth();
        let stored_admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .expect("Admin not set");
        if admin != stored_admin {
            return Err(PermissionError::Unauthorized);
        }

        let state = PermissionPauseState {
            grants_paused: false,
            updated_at_ledger: env.ledger().sequence(),
        };
        env.storage().instance().set(&DataKey::GrantPauseState, &state);

        env.events().publish(
            (symbol_short!("perm"), symbol_short!("gpaused")),
            GrantPauseChangedEvent {
                grants_paused: false,
                changed_by: admin,
                ledger: state.updated_at_ledger,
            },
        );

        Ok(())
    }

    /// Read the current grant pause state.
    pub fn get_grant_pause_state(env: Env) -> PermissionPauseState {
        env.storage()
            .instance()
            .get(&DataKey::GrantPauseState)
            .unwrap_or(PermissionPauseState {
                grants_paused: false,
                updated_at_ledger: 0,
            })
    }

    /// Returns contract name and semantic version for deployment verification (issue #103).
    pub fn version(env: Env) -> ContractVersion {
        ContractVersion {
            name: Symbol::new(&env, CONTRACT_NAME),
            semver: Symbol::new(&env, CONTRACT_SEMVER),
        }
    }

    /// Allow or forbid self-delegation globally. Admin-only (issue #182).
    pub fn set_allow_self_delegation(
        env: Env,
        admin: Address,
        allow: bool,
    ) -> Result<(), PermissionError> {
        admin.require_auth();
        let stored_admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .expect("Admin not set");
        if admin != stored_admin {
            return Err(PermissionError::Unauthorized);
        }
        env.storage()
            .instance()
            .set(&DataKey::AllowSelfDelegation, &allow);
        Ok(())
    }

    /// Grants a permission and stores optional metadata hash (issue #181).
    pub fn grant_with_metadata(
        env: Env,
        owner: Address,
        delegate: Address,
        limit_total: i128,
        limit_per_tx: i128,
        allowed_merchants: Vec<Address>,
        ttl_ledgers: u32,
        metadata: Option<PermissionMetadata>,
    ) -> Result<(), PermissionError> {
        Self::grant(
            env.clone(),
            owner.clone(),
            delegate.clone(),
            limit_total,
            limit_per_tx,
            allowed_merchants,
            ttl_ledgers,
        )?;

        let meta_key = DataKey::Metadata(owner, delegate);
        match metadata {
            Some(m) => env.storage().persistent().set(&meta_key, &m),
            None => {
                // Clear any stale metadata from a previous grant so
                // get_metadata cannot return a hash that belongs to an older policy.
                if env.storage().persistent().has(&meta_key) {
                    env.storage().persistent().remove(&meta_key);
                }
            }
        }

        Ok(())
    }

    /// Returns optional metadata for a permission grant (issue #181).
    pub fn get_metadata(
        env: Env,
        owner: Address,
        delegate: Address,
    ) -> Option<PermissionMetadata> {
        env.storage()
            .persistent()
            .get(&DataKey::Metadata(owner, delegate))
    }

    /// Returns a compact receipt for an existing permission grant (issue #180).
    /// Includes active status derived from stored state and current ledger.
    pub fn get_receipt(
        env: Env,
        owner: Address,
        delegate: Address,
    ) -> Result<PermissionReceipt, PermissionError> {
        let key = DataKey::Permission(owner.clone(), delegate.clone());
        let record: PermissionRecord = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(PermissionError::NotFound)?;

        let active = matches!(record.status, PermissionStatus::Active)
            && env.ledger().sequence() < record.expires_at_ledger;

        Ok(PermissionReceipt {
            owner,
            delegate,
            limit: record.limit_total,
            expires_at_ledger: record.expires_at_ledger,
            active,
        })
    }
}

#[cfg(test)]
mod integration_tests;
#[cfg(test)]
mod test;
