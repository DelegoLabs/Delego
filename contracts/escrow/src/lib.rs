//! Delego Escrow Contract
//!
//! Holds funds in escrow until order fulfillment is confirmed.

#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, Address, Env, IntoVal, Symbol};

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
pub enum DataKey {
    Admin,
    Escrow(u64),
    LastEscrowId,
}

#[contract]
pub struct EscrowContract;

#[contractimpl]
impl EscrowContract {
    /// Initialize the escrow contract with the admin address.
    pub fn initialize(env: Env, admin: Address) -> bool {
        if env.storage().instance().has(&DataKey::Admin) {
            return false;
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::LastEscrowId, &0u64);
        true
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
    ) -> u64 {
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
        last_id
    }

    /// Release funds to the seller. Only buyer or admin can call.
    pub fn release(env: Env, escrow_id: u64, caller: Address) -> bool {
        caller.require_auth();

        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        let key = DataKey::Escrow(escrow_id);
        let mut record: EscrowRecord = env.storage().persistent().get(&key).expect("Escrow not found");

        if caller != record.buyer && caller != admin {
            panic!("Unauthorized to release escrow");
        }

        if record.status == EscrowStatus::Released {
            panic!("Escrow already released");
        }

        if record.status != EscrowStatus::Active && record.status != EscrowStatus::Disputed {
            panic!("Escrow cannot be released in current status");
        }

        // Transfer funds to seller
        let token_client = soroban_sdk::token::Client::new(&env, &record.token);
        token_client.transfer(&env.current_contract_address(), &record.seller, &record.amount);

        record.status = EscrowStatus::Released;
        env.storage().persistent().set(&key, &record);
        true
    }

    /// Refund funds to the buyer. 
    /// - Seller or admin can refund at any time.
    /// - Buyer can refund only after the timeout.
    pub fn refund(env: Env, escrow_id: u64, caller: Address) -> bool {
        caller.require_auth();

        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        let key = DataKey::Escrow(escrow_id);
        let mut record: EscrowRecord = env.storage().persistent().get(&key).expect("Escrow not found");

        if record.status == EscrowStatus::Refunded {
            panic!("Escrow already refunded");
        }

        if record.status != EscrowStatus::Active && record.status != EscrowStatus::Disputed {
            panic!("Escrow cannot be refunded in current status");
        }

        if caller == record.seller || caller == admin {
            // Authorized at any time
        } else if caller == record.buyer {
            // Buyer can refund only if timeout has passed
            if env.ledger().timestamp() < record.unlock_time {
                panic!("Cannot refund before timeout");
            }
        } else {
            panic!("Unauthorized to refund escrow");
        }

        // Transfer funds back to buyer
        let token_client = soroban_sdk::token::Client::new(&env, &record.token);
        token_client.transfer(&env.current_contract_address(), &record.buyer, &record.amount);

        record.status = EscrowStatus::Refunded;
        env.storage().persistent().set(&key, &record);
        true
    }

    /// Mark the escrow as disputed. Only buyer or seller can call.
    pub fn dispute(env: Env, escrow_id: u64, caller: Address) -> bool {
        caller.require_auth();

        let key = DataKey::Escrow(escrow_id);
        let mut record: EscrowRecord = env.storage().persistent().get(&key).expect("Escrow not found");

        if caller != record.buyer && caller != record.seller {
            panic!("Unauthorized to dispute escrow");
        }

        if record.status != EscrowStatus::Active {
            panic!("Escrow must be active to dispute");
        }

        record.status = EscrowStatus::Disputed;
        env.storage().persistent().set(&key, &record);
        true
    }

    /// Resolve a disputed escrow. Only admin can call.
    pub fn resolve_dispute(env: Env, escrow_id: u64, caller: Address, release_to_seller: bool) -> bool {
        caller.require_auth();

        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        if caller != admin {
            panic!("Only admin can resolve disputes");
        }

        let key = DataKey::Escrow(escrow_id);
        let mut record: EscrowRecord = env.storage().persistent().get(&key).expect("Escrow not found");

        if record.status != EscrowStatus::Disputed {
            panic!("Escrow is not in dispute");
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
        true
    }

    /// Get details of an escrow record.
    pub fn get_escrow(env: Env, escrow_id: u64) -> EscrowRecord {
        let key = DataKey::Escrow(escrow_id);
        env.storage().persistent().get(&key).expect("Escrow not found")
    }
}

#[cfg(test)]
mod test;
#[cfg(test)]
mod integration_tests;
