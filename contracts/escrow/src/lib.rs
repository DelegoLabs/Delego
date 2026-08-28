//! Delego Escrow Contract
//!
//! Holds funds in escrow until order fulfillment is confirmed.

#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, contracterror, symbol_short, Address, Env, IntoVal, Symbol};

const ESCROW: Symbol = symbol_short!("ESCROW");

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum EscrowStatus {
    Active,
    Released,
    Refunded,
    Disputed,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EscrowRecord {
    pub buyer: Address,
    pub seller: Address,
    pub token: Address,
    pub amount: i128,
    pub status: EscrowStatus,
    pub unlock_time: u64,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct EscrowCreatedEvent {
    pub escrow_id: u64,
    pub buyer: Address,
    pub seller: Address,
    pub token: Address,
    pub amount: i128,
    pub unlock_time: u64,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct EscrowReleasedEvent {
    pub escrow_id: u64,
    pub seller: Address,
    pub amount: i128,
    pub released_by: Address,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct EscrowRefundedEvent {
    pub escrow_id: u64,
    pub buyer: Address,
    pub amount: i128,
    pub refunded_by: Address,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct EscrowDisputedEvent {
    pub escrow_id: u64,
    pub disputed_by: Address,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct EscrowResolvedEvent {
    pub escrow_id: u64,
    pub release_to_seller: bool,
    pub resolved_by: Address,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EligibilityCondition {
    pub key: Symbol,
    pub met: bool,
    pub message: soroban_sdk::String,
    pub effective_at: Option<u64>,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ReleaseEligibility {
    pub eligible: bool,
    pub conditions: soroban_sdk::Vec<EligibilityCondition>,
}

#[contracttype]
pub enum DataKey {
    Admin,
    Escrow(u64),
    LastEscrowId,
    PendingAdmin,
    AdminList,
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum EscrowError {
    /// Contract already initialized
    AlreadyInitialized = 1,
    /// Escrow record not found
    NotFound = 2,
    /// Caller is not authorized for this operation
    Unauthorized = 3,
    /// Escrow has already been released
    AlreadyReleased = 4,
    /// Escrow has already been refunded
    AlreadyRefunded = 5,
    /// Escrow is not in Active status
    InvalidStatus = 6,
    /// Refund timeout has not been reached
    TimeoutNotReached = 7,
    /// Escrow is not in Disputed status
    NotDisputed = 8,
    /// Invalid amount (zero or negative)
    InvalidAmount = 9,
    /// No pending admin transfer exists
    NoPendingTransfer = 13,
    /// Caller is not the pending admin
    InvalidPendingAdmin = 14,
    /// Admin already exists
    AdminAlreadyExists = 15,
}

#[contract]
pub struct EscrowContract;

#[contractimpl]
impl EscrowContract {
    /// Initialize the escrow contract with the admin address.
    pub fn initialize(env: Env, admin: Address) -> Result<bool, EscrowError> {
        if env.storage().instance().has(&DataKey::Admin) {
            return Err(EscrowError::AlreadyInitialized);
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::LastEscrowId, &0u64);
        Ok(true)
    }

    /// Create an escrow for an order. Supports direct funding by buyer,
    /// or delegated funding by an agent (checked via permissions contract).
    pub fn create_escrow(
        env: Env,
        buyer: Address,
        delegate: Address,
        permissions_contract: Address,
        seller: Address,
        token: Address,
        amount: i128,
        timeout_seconds: u64,
    ) -> Result<u64, EscrowError> {
        if amount <= 0 {
            return Err(EscrowError::InvalidAmount);
        }
        if delegate == buyer {
            buyer.require_auth();
        } else {
            delegate.require_auth();
            // Call the permissions contract to verify and execute the delegated spend
            // We use a dynamic client to call execute_spend on the permissions_contract
            env.invoke_contract::<bool>(
                &permissions_contract,
                &Symbol::new(&env, "execute_spend"),
                soroban_sdk::vec![
                    &env,
                    buyer.into_val(&env),
                    delegate.into_val(&env),
                    amount.into_val(&env),
                    seller.into_val(&env)
                ],
            );
        }

        // Transfer tokens from buyer to this contract
        let token_client = soroban_sdk::token::Client::new(&env, &token);
        token_client.transfer(&buyer, &env.current_contract_address(), &amount);

        // Increment and get last escrow ID
        let mut last_id: u64 = env.storage().instance().get(&DataKey::LastEscrowId).unwrap_or(0);
        last_id += 1;
        env.storage().instance().set(&DataKey::LastEscrowId, &last_id);

        let unlock_time = env.ledger().timestamp() + timeout_seconds;
        let record = EscrowRecord {
            buyer,
            seller,
            token,
            amount,
            status: EscrowStatus::Active,
            unlock_time,
        };

        env.storage().persistent().set(&DataKey::Escrow(last_id), &record);

        env.events().publish(
            (symbol_short!("escrow"), symbol_short!("created")),
            EscrowCreatedEvent {
                escrow_id: last_id,
                buyer: record.buyer.clone(),
                seller: record.seller.clone(),
                token: record.token.clone(),
                amount: record.amount,
                unlock_time: record.unlock_time,
            },
        );

        Ok(last_id)
    }

    /// Release funds to the seller. Only buyer or admin can call.
    pub fn release(env: Env, escrow_id: u64, caller: Address) -> Result<bool, EscrowError> {
        caller.require_auth();

        let key = DataKey::Escrow(escrow_id);
        let mut record: EscrowRecord = match env.storage().persistent().get(&key) {
            Some(rec) => rec,
            None => return Err(EscrowError::NotFound),
        };

        if caller != record.buyer && !Self::is_admin(env.clone(), caller.clone()) {
            return Err(EscrowError::Unauthorized);
        }

        if record.status == EscrowStatus::Released {
            return Err(EscrowError::AlreadyReleased);
        }

        if record.status != EscrowStatus::Active && record.status != EscrowStatus::Disputed {
            return Err(EscrowError::InvalidStatus);
        }

        // Transfer funds to seller
        let token_client = soroban_sdk::token::Client::new(&env, &record.token);
        token_client.transfer(&env.current_contract_address(), &record.seller, &record.amount);

        record.status = EscrowStatus::Released;
        env.storage().persistent().set(&key, &record);

        env.events().publish(
            (symbol_short!("escrow"), symbol_short!("released")),
            EscrowReleasedEvent {
                escrow_id,
                seller: record.seller.clone(),
                amount: record.amount,
                released_by: caller,
            },
        );

        Ok(true)
    }

    /// Refund funds to the buyer. 
    /// - Seller or admin can refund at any time.
    /// - Buyer can refund only after the timeout.
    pub fn refund(env: Env, escrow_id: u64, caller: Address) -> Result<bool, EscrowError> {
        caller.require_auth();

        let key = DataKey::Escrow(escrow_id);
        let mut record: EscrowRecord = match env.storage().persistent().get(&key) {
            Some(rec) => rec,
            None => return Err(EscrowError::NotFound),
        };

        if record.status == EscrowStatus::Refunded {
            return Err(EscrowError::AlreadyRefunded);
        }

        if record.status != EscrowStatus::Active && record.status != EscrowStatus::Disputed {
            return Err(EscrowError::InvalidStatus);
        }

        if caller == record.seller || Self::is_admin(env.clone(), caller.clone()) {
            // Authorized at any time
        } else if caller == record.buyer {
            // Buyer can refund only if timeout has passed
            if env.ledger().timestamp() < record.unlock_time {
                return Err(EscrowError::TimeoutNotReached);
            }
        } else {
            return Err(EscrowError::Unauthorized);
        }

        // Transfer funds back to buyer
        let token_client = soroban_sdk::token::Client::new(&env, &record.token);
        token_client.transfer(&env.current_contract_address(), &record.buyer, &record.amount);

        record.status = EscrowStatus::Refunded;
        env.storage().persistent().set(&key, &record);

        env.events().publish(
            (symbol_short!("escrow"), symbol_short!("refunded")),
            EscrowRefundedEvent {
                escrow_id,
                buyer: record.buyer.clone(),
                amount: record.amount,
                refunded_by: caller,
            },
        );

        Ok(true)
    }

    /// Mark the escrow as disputed. Only buyer or seller can call.
    pub fn dispute(env: Env, escrow_id: u64, caller: Address) -> Result<bool, EscrowError> {
        caller.require_auth();

        let key = DataKey::Escrow(escrow_id);
        let mut record: EscrowRecord = match env.storage().persistent().get(&key) {
            Some(rec) => rec,
            None => return Err(EscrowError::NotFound),
        };

        if caller != record.buyer && caller != record.seller {
            return Err(EscrowError::Unauthorized);
        }

        if record.status != EscrowStatus::Active {
            return Err(EscrowError::InvalidStatus);
        }

        record.status = EscrowStatus::Disputed;
        env.storage().persistent().set(&key, &record);

        env.events().publish(
            (symbol_short!("escrow"), symbol_short!("disputed")),
            EscrowDisputedEvent {
                escrow_id,
                disputed_by: caller,
            },
        );

        Ok(true)
    }

    /// Resolve a disputed escrow. Only admin can call.
    pub fn resolve_dispute(env: Env, escrow_id: u64, caller: Address, release_to_seller: bool) -> Result<bool, EscrowError> {
        caller.require_auth();

        if !Self::is_admin(env.clone(), caller.clone()) {
            return Err(EscrowError::Unauthorized);
        }

        let key = DataKey::Escrow(escrow_id);
        let mut record: EscrowRecord = match env.storage().persistent().get(&key) {
            Some(rec) => rec,
            None => return Err(EscrowError::NotFound),
        };

        if record.status != EscrowStatus::Disputed {
            return Err(EscrowError::NotDisputed);
        }

        let token_client = soroban_sdk::token::Client::new(&env, &record.token);
        if release_to_seller {
            token_client.transfer(&env.current_contract_address(), &record.seller, &record.amount);
            record.status = EscrowStatus::Released;
        } else {
            token_client.transfer(&env.current_contract_address(), &record.buyer, &record.amount);
            record.status = EscrowStatus::Refunded;
        }

        env.storage().persistent().set(&key, &record);

        env.events().publish(
            (symbol_short!("escrow"), symbol_short!("resolved")),
            EscrowResolvedEvent {
                escrow_id,
                release_to_seller,
                resolved_by: caller,
            },
        );

        Ok(true)
    }

    /// Get details of an escrow record.
    pub fn get_escrow(env: Env, escrow_id: u64) -> EscrowRecord {
        let key = DataKey::Escrow(escrow_id);
        env.storage().persistent().get(&key).expect("Escrow not found")
    }

    /// Check release eligibility for a given caller and escrow.
    /// Returns a structured list of conditions so the UI can explain
    /// why a release CTA is disabled.
    pub fn release_eligibility(
        env: Env,
        escrow_id: u64,
        caller: Address,
    ) -> ReleaseEligibility {
        let key = DataKey::Escrow(escrow_id);
        let record: Option<EscrowRecord> = env.storage().persistent().get(&key);

        let mut conditions: soroban_sdk::Vec<EligibilityCondition> = soroban_sdk::Vec::new(&env);
        let now = env.ledger().timestamp();

        // Condition: escrow must exist
        let Some(record) = record else {
            conditions.push_back(EligibilityCondition {
                key: symbol_short!("not_found"),
                met: false,
                message: soroban_sdk::String::from_str(&env, "Escrow record not found"),
                effective_at: None,
            });
            return ReleaseEligibility {
                eligible: false,
                conditions,
            };
        };

        // Condition: must not already be released
        let already_released = record.status == EscrowStatus::Released;
        conditions.push_back(EligibilityCondition {
            key: symbol_short!("not_released"),
            met: !already_released,
            message: if already_released {
                soroban_sdk::String::from_str(&env, "Escrow has already been released")
            } else {
                soroban_sdk::String::from_str(&env, "Escrow has not been released yet")
            },
            effective_at: None,
        });

        // Condition: status must be Active or Disputed
        let valid_status = matches!(record.status, EscrowStatus::Active | EscrowStatus::Disputed);
        conditions.push_back(EligibilityCondition {
            key: symbol_short!("valid_status"),
            met: valid_status,
            message: if valid_status {
                soroban_sdk::String::from_str(&env, "Escrow status permits release")
            } else {
                soroban_sdk::String::from_str(&env, "Escrow must be Active or Disputed to release")
            },
            effective_at: None,
        });

        // Condition: caller must be buyer or admin
        let is_buyer = caller == record.buyer;
        let is_admin = Self::is_admin(env.clone(), caller.clone());
        let authorized_caller = is_buyer || is_admin;
        conditions.push_back(EligibilityCondition {
            key: symbol_short!("authorized"),
            met: authorized_caller,
            message: if authorized_caller {
                if is_admin {
                    soroban_sdk::String::from_str(&env, "Caller is an admin")
                } else {
                    soroban_sdk::String::from_str(&env, "Caller is the buyer")
                }
            } else {
                soroban_sdk::String::from_str(
                    &env,
                    "Caller must be the buyer or an admin to release",
                )
            },
            effective_at: None,
        });

        // Condition: timeout must be reached (only for buyer; admin can bypass)
        let timeout_met = is_admin || now >= record.unlock_time;
        let effective_at = if is_admin {
            None
        } else {
            Some(record.unlock_time)
        };
        let secs_remaining: i128 = record.unlock_time as i128 - now as i128;
        let msg = if is_admin {
            soroban_sdk::String::from_str(&env, "Admin may release before timeout")
        } else if timeout_met {
            soroban_sdk::String::from_str(&env, "Release timeout has been reached")
        } else {
            let days = secs_remaining / 86400;
            let hours = (secs_remaining % 86400) / 3600;
            let mins = (secs_remaining % 3600) / 60;
            let mut s = soroban_sdk::String::from_str(&env, "Timeout not reached — releases unlock in ");
            if days > 0 {
                s = s.concat(&soroban_sdk::String::from_str(
                    &env,
                    &format!("{}d ", days),
                ));
            }
            if hours > 0 || days > 0 {
                s = s.concat(&soroban_sdk::String::from_str(
                    &env,
                    &format!("{}h ", hours),
                ));
            }
            s = s.concat(&soroban_sdk::String::from_str(
                &env,
                &format!("{}m", mins.max(1)),
            ));
            s
        };
        conditions.push_back(EligibilityCondition {
            key: symbol_short!("timeout"),
            met: timeout_met,
            message: msg,
            effective_at,
        });

        let eligible = conditions.iter().all(|c| c.met);
        ReleaseEligibility {
            eligible,
            conditions,
        }
    }

    /// Propose a new primary admin. Must be called by current primary admin.
    pub fn propose_admin(env: Env, current_admin: Address, new_admin: Address) -> Result<bool, EscrowError> {
        current_admin.require_auth();
        let primary_admin: Address = env.storage().instance().get(&DataKey::Admin).ok_or(EscrowError::NotFound)?;
        if current_admin != primary_admin {
            return Err(EscrowError::Unauthorized);
        }
        env.storage().instance().set(&DataKey::PendingAdmin, &new_admin);
        Ok(true)
    }

    /// Accept the primary admin role. Must be called by the proposed new admin.
    pub fn accept_admin(env: Env, new_admin: Address) -> Result<bool, EscrowError> {
        new_admin.require_auth();
        let pending_admin: Address = match env.storage().instance().get(&DataKey::PendingAdmin) {
            Some(addr) => addr,
            None => return Err(EscrowError::NoPendingTransfer),
        };
        if new_admin != pending_admin {
            return Err(EscrowError::InvalidPendingAdmin);
        }

        let mut admin_list: soroban_sdk::Vec<Address> = env
            .storage()
            .instance()
            .get(&DataKey::AdminList)
            .unwrap_or_else(|| soroban_sdk::Vec::new(&env));
        if let Some(index) = admin_list.first_index_of(&new_admin) {
            admin_list.remove(index);
            env.storage().instance().set(&DataKey::AdminList, &admin_list);
        }

        env.storage().instance().set(&DataKey::Admin, &new_admin);
        env.storage().instance().remove(&DataKey::PendingAdmin);
        Ok(true)
    }

    /// Cancel a pending admin transfer. Must be called by current primary admin.
    pub fn cancel_admin_transfer(env: Env, current_admin: Address) -> Result<bool, EscrowError> {
        current_admin.require_auth();
        let primary_admin: Address = env.storage().instance().get(&DataKey::Admin).ok_or(EscrowError::NotFound)?;
        if current_admin != primary_admin {
            return Err(EscrowError::Unauthorized);
        }
        if !env.storage().instance().has(&DataKey::PendingAdmin) {
            return Err(EscrowError::NoPendingTransfer);
        }
        env.storage().instance().remove(&DataKey::PendingAdmin);
        Ok(true)
    }

    /// Add a co-admin. Must be called by the primary admin.
    pub fn add_co_admin(env: Env, admin: Address, new_co_admin: Address) -> Result<bool, EscrowError> {
        admin.require_auth();
        let primary_admin: Address = env.storage().instance().get(&DataKey::Admin).ok_or(EscrowError::NotFound)?;
        if admin != primary_admin {
            return Err(EscrowError::Unauthorized);
        }
        if new_co_admin == primary_admin {
            return Err(EscrowError::AdminAlreadyExists);
        }
        let mut admin_list: soroban_sdk::Vec<Address> = env
            .storage()
            .instance()
            .get(&DataKey::AdminList)
            .unwrap_or_else(|| soroban_sdk::Vec::new(&env));
        if admin_list.contains(&new_co_admin) {
            return Err(EscrowError::AdminAlreadyExists);
        }
        admin_list.push_back(new_co_admin);
        env.storage().instance().set(&DataKey::AdminList, &admin_list);
        Ok(true)
    }

    /// Remove a co-admin. Must be called by the primary admin.
    pub fn remove_co_admin(env: Env, admin: Address, co_admin: Address) -> Result<bool, EscrowError> {
        admin.require_auth();
        let primary_admin: Address = env.storage().instance().get(&DataKey::Admin).ok_or(EscrowError::NotFound)?;
        if admin != primary_admin {
            return Err(EscrowError::Unauthorized);
        }
        let mut admin_list: soroban_sdk::Vec<Address> = env
            .storage()
            .instance()
            .get(&DataKey::AdminList)
            .unwrap_or_else(|| soroban_sdk::Vec::new(&env));
        let index = match admin_list.first_index_of(&co_admin) {
            Some(idx) => idx,
            None => return Err(EscrowError::NotFound),
        };
        admin_list.remove(index);
        env.storage().instance().set(&DataKey::AdminList, &admin_list);
        Ok(true)
    }

    /// Returns true if the address is the primary admin or a co-admin.
    pub fn is_admin(env: Env, address: Address) -> bool {
        let primary_admin: Address = match env.storage().instance().get(&DataKey::Admin) {
            Some(addr) => addr,
            None => return false,
        };
        if address == primary_admin {
            return true;
        }
        let admin_list: soroban_sdk::Vec<Address> = env
            .storage()
            .instance()
            .get(&DataKey::AdminList)
            .unwrap_or_else(|| soroban_sdk::Vec::new(&env));
        admin_list.contains(&address)
    }
}

#[cfg(test)]
mod test;
#[cfg(test)]
mod integration_tests;
