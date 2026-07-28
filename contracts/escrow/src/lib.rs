//! Delego Escrow Contract
//!
//! Holds funds in escrow until order fulfillment is confirmed.

#![no_std]
// `create` and `deposit` have 9 parameters — more than clippy's default limit of 7.
// These are Soroban contract entry points whose signatures are part of the
// published on-chain ABI; restructuring them would be a breaking change.
// The `contractargs` proc-macro also generates wrapper functions that exceed the
// limit, which cannot be annotated individually from user code.
#![allow(clippy::too_many_arguments)]
use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, symbol_short, Address, BytesN, Env,
    InvokeError, Symbol, Vec,
};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum EscrowStatus {
    Created,
    Funded,
    Released,
    Refunded,
    Disputed,
    Cancelled,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum EscrowTerminalState {
    Released,
    Refunded,
    Cancelled,
}

impl EscrowTerminalState {
    pub fn from_status(status: &EscrowStatus) -> Option<Self> {
        match status {
            EscrowStatus::Released => Some(EscrowTerminalState::Released),
            EscrowStatus::Refunded => Some(EscrowTerminalState::Refunded),
            EscrowStatus::Cancelled => Some(EscrowTerminalState::Cancelled),
            _ => None,
        }
    }
}

/// Optional yield accrual configuration for an escrow (issue #331).
///
/// References an external lending contract that funds are notionally
/// deposited with while escrowed, and the annual rate at which yield
/// accrues for as long as the escrow remains held.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct YieldConfig {
    /// Lending contract the escrowed funds notionally earn yield through.
    pub lending_contract: Address,
    /// Annual yield rate in basis points (e.g., 500 = 5% APR).
    pub apr_bps: u32,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EscrowRecord {
    pub escrow_id: u64,
    pub buyer: Address,
    pub seller: Address,
    pub token: Address,
    pub amount: i128,
    pub released_amount: i128,
    pub refunded_amount: i128,
    pub status: EscrowStatus,
    pub order_id: BytesN<32>,
    pub created_at: u64,
    pub timeout_ledger: u32,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PartialReleaseResult {
    pub released: i128,
    pub remaining: i128,
    pub fully_released: bool,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PartialRefundResult {
    pub refunded: i128,
    pub remaining: i128,
    pub fully_refunded: bool,
}

/// Configured external condition that gates release of an escrow via
/// `evaluate_and_release` (issue #339).
///
/// `oracle_contract` must expose a `resolve(condition_type: Symbol) -> bool`
/// function. `evaluate_and_release` calls it and only releases funds when it
/// returns `true`.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ReleaseCondition {
    pub condition_type: Symbol,
    pub oracle_contract: Address,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct EscrowCreatedEvent {
    pub escrow_id: u64,
    pub buyer: Address,
    pub seller: Address,
    pub token: Address,
    pub amount: i128,
    pub order_id: BytesN<32>,
    pub timeout_ledger: u32,
}

/// Emitted when escrow creation includes an off-chain order metadata hash.
///
/// `escrow_id` is the 32-byte order id so indexers can join contract events
/// to off-chain order records (same correlation key as `ReleaseEligibility`).
#[contracttype]
#[derive(Clone, Debug)]
pub struct EscrowMetadataEvent {
    pub escrow_id: BytesN<32>,
    pub order_hash: BytesN<32>,
    pub schema: Symbol,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EscrowCancelledEvent {
    pub escrow_id: BytesN<32>,
    pub cancelled_by: Address,
    pub reason: Symbol,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct EscrowReleasedEvent {
    pub escrow_id: u64,
    pub seller: Address,
    pub amount: i128,
    pub released_by: Address,
}

/// Emitted alongside the release event when a fully-released escrow had a
/// `YieldConfig` set, reporting the yield accrued over its holding period
/// (issue #331).
#[contracttype]
#[derive(Clone, Debug)]
pub struct EscrowYieldAccruedEvent {
    pub escrow_id: u64,
    pub seller: Address,
    pub yield_amount: i128,
    pub held_seconds: u64,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct EscrowRefundedEvent {
    pub escrow_id: u64,
    pub buyer: Address,
    pub amount: i128,
    pub remaining: i128,
    pub refunded_by: Address,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct ReleaseConditionSetEvent {
    pub escrow_id: u64,
    pub condition_type: Symbol,
    pub oracle_contract: Address,
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
#[derive(Clone, Debug)]
pub struct AdminProposedEvent {
    pub current_admin: Address,
    pub new_admin: Address,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct AdminAcceptedEvent {
    pub new_admin: Address,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct AdminTransferCancelledEvent {
    pub current_admin: Address,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct EscrowPauseChangedEvent {
    pub paused: bool,
    pub admin: Address,
    pub ledger: u32,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EscrowPauseState {
    pub create_paused: bool,
    pub updated_by: Address,
    pub updated_at_ledger: u32,
    pub expires_at_ledger: Option<u32>,
}

/// Emitted when the contract is upgraded to new wasm code (issue #325).
#[contracttype]
#[derive(Clone, Debug)]
pub struct ContractUpgradedEvent {
    pub admin: Address,
    pub previous_semver: Symbol,
    pub new_wasm_hash: BytesN<32>,
}

/// Emitted when the multi-treasury fee distribution is updated (issue #327).
#[contracttype]
#[derive(Clone, Debug)]
pub struct FeeDistributionSetEvent {
    pub admin: Address,
    pub treasury_count: u32,
    pub total_bps: u32,
}

/// Optional metadata hash stored on escrow creation for off-chain order verification.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EscrowMetadata {
    /// Hash of off-chain order details (e.g., order JSON)
    pub order_hash: BytesN<32>,
    /// Schema identifier for the off-chain data (e.g., "order_v1")
    pub schema: Symbol,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EscrowTokenView {
    pub escrow_id: u64,
    pub token: Address,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct FeeConfig {
    /// Fee in basis points (e.g., 250 = 2.5%)
    pub fee_bps: u32,
    /// Address that receives the fee
    pub treasury: Address,
}

/// One treasury's share of the release fee, used by [`FeeConfig`]'s
/// multi-treasury successor configured via `set_fee_distribution`.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TreasuryShare {
    /// Address that receives this share of the fee
    pub treasury: Address,
    /// Share in basis points (e.g., 250 = 2.5%)
    pub bps: u32,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EscrowAmountLimits {
    pub min_amount: i128,
    pub max_amount: i128,
}

/// Shared liquidity reserve for a single token, used to instantly settle
/// funded escrows without waiting on the ordinary buyer/admin release flow
/// (issue #335).
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct LiquidityPool {
    pub token: Address,
    pub balance: i128,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct PoolFundedEvent {
    pub token: Address,
    pub funder: Address,
    pub amount: i128,
    pub new_balance: i128,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct PoolWithdrawnEvent {
    pub token: Address,
    pub admin: Address,
    pub amount: i128,
    pub new_balance: i128,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct PoolSettledEvent {
    pub escrow_id: u64,
    pub token: Address,
    pub seller: Address,
    pub amount: i128,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct QuorumConfig {
    pub arbiters: soroban_sdk::Vec<Address>,
    pub threshold: u32,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DisputeVote {
    pub arbiter: Address,
    pub release_to_seller: bool,
}

/// A single arbiter's vote to extend an escrow's refund timeout, cast via
/// `extend_timeout_via_quorum` (issue #333).
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TimeoutExtensionVote {
    pub arbiter: Address,
    pub extension_ledgers: u32,
    pub voted_at: u64,
}

/// Emitted once quorum is reached and `timeout_ledger` is extended.
#[contracttype]
#[derive(Clone, Debug)]
pub struct TimeoutExtendedEvent {
    pub escrow_id: u64,
    pub previous_timeout_ledger: u32,
    pub new_timeout_ledger: u32,
    pub extension_ledgers: u32,
}

/// Emitted when escrow funds are split among multiple recipients (issue #321).
#[contracttype]
#[derive(Clone, Debug)]
pub struct EscrowSplitReleasedEvent {
    pub escrow_id: u64,
    pub recipient_count: u32,
    pub total_released: i128,
    pub fee_charged: i128,
    pub released_by: Address,
}

/// Emitted when an escrow's timeout is extended directly (issue #323).
#[contracttype]
#[derive(Clone, Debug)]
pub struct EscrowTimeoutExtendedEvent {
    pub escrow_id: u64,
    pub old_timeout_ledger: u32,
    pub new_timeout_ledger: u32,
    pub extended_by: Address,
}

/// Contract version information for deployment scripts and runtime compatibility checks.
///
/// # When to bump
/// - **Patch** (third digit): Bug fixes, internal refactors, gas optimizations — no
///   observable contract-behaviour change to callers.
/// - **Minor** (second digit): New read-only getters, new events, new optional
///   parameters — backward-compatible additions.
/// - **Major** (first digit): Breaking changes — removed functions, changed
///   function signatures, altered storage layout, modified event shapes.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ContractVersion {
    pub name: Symbol,
    pub semver: Symbol,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AdminView {
    pub admin: Address,
    pub pending_admin: Option<Address>,
}

#[contracttype]
pub enum DataKey {
    Admin,
    Escrow(u64),
    LastEscrowId,
    PendingAdmin,
    AdminList,
    FeeConfig,
    AmountLimits,
    QuorumConfig,
    DisputeVotes(u64),
    TimeoutExtensionVotes(u64),
    TokenWhitelist,
    TokenEnabled(Address),
    PauseState,
    EscrowMetadata(u64),
    LiquidityPool(Address),
    /// Set to `true` the first time the contract is upgraded via `upgrade`.
    MigrationFlag,
    /// Optional multi-treasury fee split configured via `set_fee_distribution`.
    FeeDistribution,
    /// Optional yield configuration for an escrow.
    EscrowYieldConfig(u64),
    /// Release condition for an escrow.
    ReleaseCondition(u64),
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
    /// Escrow is not in Funded status
    InvalidStatus = 6,
    /// Refund timeout has not been reached
    TimeoutNotReached = 7,
    /// Escrow is not in Disputed status
    NotDisputed = 8,
    /// Invalid amount (zero or negative)
    InvalidAmount = 9,
    /// Address is zero or otherwise invalid for this contract action
    InvalidAddress = 32,
    /// Buyer and seller must be distinct parties
    InvalidEscrowParticipants = 33,
    /// Token is not approved for escrow deposits
    TokenNotWhitelisted = 10,
    /// Release amount exceeds remaining escrow balance
    InsufficientEscrowBalance = 11,
    /// Release amount is zero
    ZeroAmount = 12,
    /// No pending admin transfer exists
    NoPendingTransfer = 13,
    /// Caller is not the pending admin
    InvalidPendingAdmin = 14,
    /// Admin already exists
    AdminAlreadyExists = 15,
    /// Fee BPS exceeds maximum (1000 bps = 10%)
    InvalidFeeBps = 16,
    /// Amount is below the minimum allowed
    AmountBelowMin = 17,
    /// Amount is above the maximum allowed
    AmountAboveMax = 18,
    /// Invalid limits (min <= 0 or max < min)
    InvalidLimits = 19,
    /// Not an authorized arbiter
    NotAnArbiter = 20,
    /// Arbiter has already voted
    AlreadyVoted = 21,
    /// Invalid quorum threshold
    InvalidQuorum = 22,
    /// Quorum not yet reached
    QuorumNotReached = 23,
    /// Quorum config not set
    QuorumConfigNotSet = 24,
    /// Conflicting quorum outcomes
    ConflictingQuorum = 25,
    /// Release recipient does not match the stored seller address
    InvalidReleaseRecipient = 201,
    /// New escrow creation is currently paused by admin
    CreationPaused = 26,
    /// Escrow has already been cancelled
    AlreadyCancelled = 27,
    /// Escrow has already been funded
    AlreadyFunded = 28,
    /// Extension length must be greater than zero
    InvalidExtension = 29,
    /// No liquidity pool exists for the given token
    PoolNotFound = 30,
    /// Liquidity pool balance is insufficient for the requested operation
    InsufficientPoolBalance = 31,
    /// Fee config has not been initialized
    FeeConfigNotSet = 34,
    /// Amount limits have not been initialized
    AmountLimitsNotSet = 35,
    /// Release condition not set for escrow
    ReleaseConditionNotSet = 36,
    /// Oracle contract call failed
    OracleCallFailed = 37,
    /// Release condition not met
    ConditionNotMet = 38,
    /// Invalid yield configuration
    InvalidYieldConfig = 39,
}

/// Compact receipt returned to buyers after escrow creation via `get_receipt`.
///
/// Fields are a purposeful subset of `EscrowRecord` — callers that need the
/// full record (amount, token, timeout, …) should use `get_escrow` instead.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EscrowReceipt {
    /// Numeric escrow identifier (matches the value returned by `deposit`).
    pub escrow_id: u64,
    /// Address of the buyer who funded the escrow.
    pub buyer: Address,
    /// Address of the seller (merchant) who will receive the released funds.
    pub seller: Address,
    /// Merchant-facing order reference embedded at deposit time.
    pub order_id: BytesN<32>,
    /// Current lifecycle status of the escrow.
    pub status: EscrowStatus,
}

/// Merchant-facing receipt for dashboards and settlement checks (issue #171).
///
/// `escrow_id` is the 32-byte order id (same correlation key as
/// [`ReleaseEligibility`]). `release_eligible` is computed read-only from
/// the current status and timeout without mutating state.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MerchantEscrowReceipt {
    pub escrow_id: BytesN<32>,
    pub merchant: Address,
    pub buyer: Address,
    pub status: EscrowStatus,
    pub release_eligible: bool,
}

/// Refund eligibility result returned by `get_refund_eligibility` (issue #173).
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RefundEligibility {
    pub escrow_id: u64,
    pub eligible: bool,
    pub reason: Symbol,
}

/// Release eligibility result returned by `get_release_eligibility`.
///
/// `escrow_id` mirrors the escrow record's 32-byte order id so settlement
/// workers can correlate the read-only response with their backend job.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ReleaseEligibility {
    pub escrow_id: BytesN<32>,
    pub eligible: bool,
    pub reason: Symbol,
}

/// Read-only timeout metadata for a single escrow (issue #88).
///
/// Returned by [`EscrowContract::get_timeout_view`].  All fields are
/// derived from stored state and the current ledger sequence — the getter
/// never mutates contract storage.
///
/// # Fields
/// - `escrow_id`      — Numeric escrow identifier (matches `EscrowRecord.escrow_id`).
/// - `timeout_ledger` — Ledger sequence at which the buyer-refund timeout expires.
/// - `current_ledger` — Ledger sequence at the time this getter was invoked.
/// - `refundable`     — `true` when `current_ledger >= timeout_ledger` **and** the
///                      escrow is still in `Funded` status (buyer may refund).
///                      `false` for terminal states (Released / Refunded) or when
///                      the timeout has not yet been reached.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EscrowTimeoutView {
    pub escrow_id: BytesN<32>,
    pub timeout_ledger: u32,
    pub current_ledger: u32,
    pub refundable: bool,
}

/// Complete read-only state snapshot for an escrow, returned by
/// `get_escrow_snapshot` (issue #329) so off-chain indexers can audit an
/// escrow's full state in a single call instead of replaying its event
/// history.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EscrowSnapshot {
    pub record: EscrowRecord,
    pub fee_config: FeeConfig,
    pub current_ledger: u32,
    pub timed_out: bool,
    pub release_eligible: bool,
}

/// Read-only view of the yield an escrow has accrued so far, returned by
/// `get_accrued_yield` (issue #331).
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EscrowYieldView {
    pub escrow_id: u64,
    pub accrued_yield: i128,
    pub apr_bps: u32,
}

/// Seconds in a 365-day year, used to prorate `YieldConfig::apr_bps` down to
/// the actual holding period of an escrow.
const SECONDS_PER_YEAR: i128 = 31_536_000;

fn check_not_terminal(record: &EscrowRecord) -> Result<(), EscrowError> {
    match record.status {
        EscrowStatus::Released => Err(EscrowError::AlreadyReleased),
        EscrowStatus::Refunded => Err(EscrowError::AlreadyRefunded),
        EscrowStatus::Cancelled => Err(EscrowError::AlreadyCancelled),
        _ => Ok(()),
    }
}

const ZERO_ACCOUNT_STRKEY: &str = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";
const ZERO_CONTRACT_STRKEY: &str = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4";

fn is_zero_address(env: &Env, address: &Address) -> bool {
    let zero_account = Address::from_str(env, ZERO_ACCOUNT_STRKEY);
    let zero_contract = Address::from_str(env, ZERO_CONTRACT_STRKEY);
    address == &zero_account || address == &zero_contract
}

#[contract]
pub struct EscrowContract;

#[contractimpl]
impl EscrowContract {
    /// Initialize the escrow contract with the admin, fee config, and amount limits.
    pub fn initialize(
        env: Env,
        admin: Address,
        fee_bps: u32,
        treasury: Address,
        min_amount: i128,
        max_amount: i128,
    ) -> Result<bool, EscrowError> {
        if env.storage().instance().has(&DataKey::Admin) {
            return Err(EscrowError::AlreadyInitialized);
        }
        if fee_bps > 1000 {
            return Err(EscrowError::InvalidFeeBps);
        }
        if min_amount <= 0 || max_amount < min_amount {
            return Err(EscrowError::InvalidLimits);
        }
        if is_zero_address(&env, &treasury) {
            return Err(EscrowError::InvalidAddress);
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::LastEscrowId, &0u64);
        env.storage()
            .instance()
            .set(&DataKey::FeeConfig, &FeeConfig { fee_bps, treasury });
        env.storage().instance().set(
            &DataKey::AmountLimits,
            &EscrowAmountLimits {
                min_amount,
                max_amount,
            },
        );
        Ok(true)
    }

    /// Return the contract name and semantic version.
    /// Callable without authentication — safe for off-chain tooling.
    pub fn version(_env: Env) -> ContractVersion {
        ContractVersion {
            name: symbol_short!("escrow"),
            semver: symbol_short!("0_1_0"),
        }
    }

    /// Read-only version check for backend services to call before
    /// interacting with the contract (issue #325). Equivalent to `version`.
    pub fn check_version(env: Env) -> ContractVersion {
        Self::version(env)
    }

    /// Return the active primary admin and any pending primary admin transfer.
    /// Callable without authentication for backend health checks and deployment
    /// verification.
    ///
    /// # Errors
    /// Returns [`EscrowError::NotFound`] when the contract has not been initialized.
    pub fn get_admin(env: Env) -> Result<AdminView, EscrowError> {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(EscrowError::NotFound)?;
        let pending_admin: Option<Address> =
            env.storage().instance().get(&DataKey::PendingAdmin);

        Ok(AdminView {
            admin,
            pending_admin,
        })
    }

    /// Upgrade the contract to new wasm code. Admin-only.
    ///
    /// Persistent storage (escrows, admin list, fee config, …) is keyed by
    /// contract instance and is unaffected by an upgrade — only the
    /// executable code changes, so existing escrows remain functional
    /// afterwards. Sets the migration flag and emits
    /// [`ContractUpgradedEvent`] so backend services can detect the version
    /// change.
    pub fn upgrade(
        env: Env,
        admin: Address,
        new_wasm_hash: BytesN<32>,
    ) -> Result<bool, EscrowError> {
        admin.require_auth();
        if !Self::is_admin(env.clone(), admin.clone()) {
            return Err(EscrowError::Unauthorized);
        }

        let previous_semver = Self::version(env.clone()).semver;

        env.storage().instance().set(&DataKey::MigrationFlag, &true);
        env.events().publish(
            (symbol_short!("escrow"), symbol_short!("upgraded")),
            ContractUpgradedEvent {
                admin,
                previous_semver,
                new_wasm_hash: new_wasm_hash.clone(),
            },
        );

        env.deployer().update_current_contract_wasm(new_wasm_hash);

        Ok(true)
    }

    /// Returns true once the contract has been upgraded at least once via `upgrade`.
    pub fn is_migrated(env: Env) -> bool {
        env.storage()
            .instance()
            .get(&DataKey::MigrationFlag)
            .unwrap_or(false)
    }

    /// Set the escrow amount limits. Admin-only.
    pub fn set_limits(
        env: Env,
        admin: Address,
        min_amount: i128,
        max_amount: i128,
    ) -> Result<bool, EscrowError> {
        admin.require_auth();
        if !Self::is_admin(env.clone(), admin.clone()) {
            return Err(EscrowError::Unauthorized);
        }
        if min_amount <= 0 || max_amount < min_amount {
            return Err(EscrowError::InvalidLimits);
        }
        env.storage().instance().set(
            &DataKey::AmountLimits,
            &EscrowAmountLimits {
                min_amount,
                max_amount,
            },
        );
        Ok(true)
    }

    /// Get the current escrow amount limits.
    ///
    /// # Errors
    /// Returns [`EscrowError::AmountLimitsNotSet`] when the contract has not
    /// been initialized with amount limits yet.
    pub fn get_limits(env: Env) -> Result<EscrowAmountLimits, EscrowError> {
        env.storage()
            .instance()
            .get(&DataKey::AmountLimits)
            .ok_or(EscrowError::AmountLimitsNotSet)
    }

    /// Set the quorum configuration for dispute resolution. Admin-only.
    pub fn set_quorum_config(
        env: Env,
        admin: Address,
        arbiters: soroban_sdk::Vec<Address>,
        threshold: u32,
    ) -> Result<bool, EscrowError> {
        admin.require_auth();
        if !Self::is_admin(env.clone(), admin.clone()) {
            return Err(EscrowError::Unauthorized);
        }
        if threshold == 0 || threshold > arbiters.len() {
            return Err(EscrowError::InvalidQuorum);
        }
        // Check for duplicate arbiters
        let mut unique_arbiters = soroban_sdk::Vec::new(&env);
        for arbiter in arbiters.iter() {
            if unique_arbiters.contains(&arbiter) {
                return Err(EscrowError::InvalidQuorum);
            }
            unique_arbiters.push_back(arbiter);
        }
        let quorum_config = QuorumConfig {
            arbiters: unique_arbiters,
            threshold,
        };
        env.storage()
            .instance()
            .set(&DataKey::QuorumConfig, &quorum_config);
        Ok(true)
    }

    /// Get the current quorum configuration.
    pub fn get_quorum_config(env: Env) -> Result<QuorumConfig, EscrowError> {
        env.storage()
            .instance()
            .get(&DataKey::QuorumConfig)
            .ok_or(EscrowError::QuorumConfigNotSet)
    }

    /// Vote on a disputed escrow. Only authorized arbiters.
    pub fn vote_dispute(
        env: Env,
        escrow_id: u64,
        arbiter: Address,
        release_to_seller: bool,
    ) -> Result<bool, EscrowError> {
        arbiter.require_auth();

        let quorum_config: QuorumConfig = env
            .storage()
            .instance()
            .get(&DataKey::QuorumConfig)
            .ok_or(EscrowError::QuorumConfigNotSet)?;
        if !quorum_config.arbiters.contains(&arbiter) {
            return Err(EscrowError::NotAnArbiter);
        }

        let key = DataKey::Escrow(escrow_id);
        let record: EscrowRecord = match env.storage().persistent().get(&key) {
            Some(rec) => rec,
            None => return Err(EscrowError::NotFound),
        };
        if record.status != EscrowStatus::Disputed {
            return Err(EscrowError::NotDisputed);
        }

        let votes_key = DataKey::DisputeVotes(escrow_id);
        let mut votes: soroban_sdk::Vec<DisputeVote> = env
            .storage()
            .persistent()
            .get(&votes_key)
            .unwrap_or_else(|| soroban_sdk::Vec::new(&env));

        if votes.iter().any(|vote| vote.arbiter == arbiter) {
            return Err(EscrowError::AlreadyVoted);
        }

        votes.push_back(DisputeVote {
            arbiter,
            release_to_seller,
        });
        env.storage().persistent().set(&votes_key, &votes);

        Ok(true)
    }

    /// Get votes for a disputed escrow.
    pub fn get_dispute_votes(env: Env, escrow_id: u64) -> soroban_sdk::Vec<DisputeVote> {
        let votes_key = DataKey::DisputeVotes(escrow_id);
        env.storage()
            .persistent()
            .get(&votes_key)
            .unwrap_or_else(|| soroban_sdk::Vec::new(&env))
    }

    /// Resolve a disputed escrow via quorum.
    pub fn resolve_dispute_quorum(
        env: Env,
        escrow_id: u64,
        caller: Address,
    ) -> Result<bool, EscrowError> {
        caller.require_auth();

        let key = DataKey::Escrow(escrow_id);
        let mut record: EscrowRecord = match env.storage().persistent().get(&key) {
            Some(rec) => rec,
            None => return Err(EscrowError::NotFound),
        };
        if record.status != EscrowStatus::Disputed {
            return Err(EscrowError::NotDisputed);
        }

        let quorum_config: QuorumConfig = env
            .storage()
            .instance()
            .get(&DataKey::QuorumConfig)
            .ok_or(EscrowError::QuorumConfigNotSet)?;
        let votes_key = DataKey::DisputeVotes(escrow_id);
        let votes: soroban_sdk::Vec<DisputeVote> = env
            .storage()
            .persistent()
            .get(&votes_key)
            .unwrap_or_else(|| soroban_sdk::Vec::new(&env));

        // Only count votes from current arbiters
        let seller_votes = votes
            .iter()
            .filter(|v| v.release_to_seller && quorum_config.arbiters.contains(&v.arbiter))
            .count() as u32;
        let buyer_votes = votes
            .iter()
            .filter(|v| !v.release_to_seller && quorum_config.arbiters.contains(&v.arbiter))
            .count() as u32;

        // Handle conflicting quorum outcomes explicitly
        let release_to_seller =
            if seller_votes >= quorum_config.threshold && buyer_votes >= quorum_config.threshold {
                return Err(EscrowError::ConflictingQuorum);
            } else if seller_votes >= quorum_config.threshold {
                true
            } else if buyer_votes >= quorum_config.threshold {
                false
            } else {
                return Err(EscrowError::QuorumNotReached);
            };

        let token_client = soroban_sdk::token::Client::new(&env, &record.token);
        if release_to_seller {
            let fee = Self::distribute_fee(&env, &token_client, record.amount)?;
            let seller_amount = record.amount - fee;

            token_client.transfer(
                &env.current_contract_address(),
                &record.seller,
                &seller_amount,
            );
            record.status = EscrowStatus::Released;
        } else {
            token_client.transfer(
                &env.current_contract_address(),
                &record.buyer,
                &record.amount,
            );
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

    /// Vote to extend the refund timeout of an escrow via arbiter quorum.
    ///
    /// Any arbiter configured in [`QuorumConfig`] may cast one vote per
    /// escrow proposing an `extension_ledgers` amount. Once at least
    /// `threshold` arbiters have voted for the *same* `extension_ledgers`
    /// value, the escrow's `timeout_ledger` is pushed back by that amount,
    /// a [`TimeoutExtendedEvent`] is published, and the vote log is cleared
    /// so arbiters can vote again for a future extension.
    ///
    /// Requires the escrow to not be in a terminal state (Released,
    /// Refunded, Cancelled). Each arbiter may vote only once per round.
    pub fn extend_timeout_via_quorum(
        env: Env,
        escrow_id: u64,
        arbiter: Address,
        extension_ledgers: u32,
    ) -> Result<bool, EscrowError> {
        arbiter.require_auth();

        if extension_ledgers == 0 {
            return Err(EscrowError::InvalidExtension);
        }

        let quorum_config: QuorumConfig = env
            .storage()
            .instance()
            .get(&DataKey::QuorumConfig)
            .ok_or(EscrowError::QuorumConfigNotSet)?;
        if !quorum_config.arbiters.contains(&arbiter) {
            return Err(EscrowError::NotAnArbiter);
        }

        let key = DataKey::Escrow(escrow_id);
        let mut record: EscrowRecord = match env.storage().persistent().get(&key) {
            Some(rec) => rec,
            None => return Err(EscrowError::NotFound),
        };
        check_not_terminal(&record)?;

        let votes_key = DataKey::TimeoutExtensionVotes(escrow_id);
        let mut votes: soroban_sdk::Vec<TimeoutExtensionVote> = env
            .storage()
            .persistent()
            .get(&votes_key)
            .unwrap_or_else(|| soroban_sdk::Vec::new(&env));

        if votes.iter().any(|vote| vote.arbiter == arbiter) {
            return Err(EscrowError::AlreadyVoted);
        }

        votes.push_back(TimeoutExtensionVote {
            arbiter,
            extension_ledgers,
            voted_at: env.ledger().timestamp(),
        });

        let matching_votes = votes
            .iter()
            .filter(|vote| vote.extension_ledgers == extension_ledgers)
            .count() as u32;

        if matching_votes < quorum_config.threshold {
            env.storage().persistent().set(&votes_key, &votes);
            return Ok(false);
        }

        let previous_timeout_ledger = record.timeout_ledger;
        let new_timeout_ledger = previous_timeout_ledger.saturating_add(extension_ledgers);
        record.timeout_ledger = new_timeout_ledger;
        env.storage().persistent().set(&key, &record);
        env.storage().persistent().remove(&votes_key);

        env.events().publish(
            (symbol_short!("escrow"), symbol_short!("tmo_ext")),
            TimeoutExtendedEvent {
                escrow_id,
                previous_timeout_ledger,
                new_timeout_ledger,
                extension_ledgers,
            },
        );

        Ok(true)
    }

    /// Get the recorded timeout-extension votes for an escrow's current round.
    pub fn get_timeout_extension_votes(
        env: Env,
        escrow_id: u64,
    ) -> soroban_sdk::Vec<TimeoutExtensionVote> {
        let votes_key = DataKey::TimeoutExtensionVotes(escrow_id);
        env.storage()
            .persistent()
            .get(&votes_key)
            .unwrap_or_else(|| soroban_sdk::Vec::new(&env))
    }

    /// Update the fee percentage. Admin-only.
    pub fn update_fee(env: Env, admin: Address, new_fee_bps: u32) -> Result<bool, EscrowError> {
        admin.require_auth();
        if !Self::is_admin(env.clone(), admin.clone()) {
            return Err(EscrowError::Unauthorized);
        }
        if new_fee_bps > 1000 {
            return Err(EscrowError::InvalidFeeBps);
        }
        let mut fee_config: FeeConfig = Self::get_fee_config(env.clone())?;
        fee_config.fee_bps = new_fee_bps;
        env.storage()
            .instance()
            .set(&DataKey::FeeConfig, &fee_config);
        Ok(true)
    }

    /// Get the current fee configuration.
    ///
    /// # Errors
    /// Returns [`EscrowError::FeeConfigNotSet`] when the contract has not
    /// been initialized with fee configuration yet.
    pub fn get_fee_config(env: Env) -> Result<FeeConfig, EscrowError> {
        env.storage()
            .instance()
            .get(&DataKey::FeeConfig)
            .ok_or(EscrowError::FeeConfigNotSet)
    }

    /// Configure the release fee to be split across multiple treasuries. Admin-only.
    ///
    /// The combined `bps` across all shares must not exceed 1000 (10%). Once
    /// set, `resolve_dispute` and `resolve_dispute_quorum` pay each treasury
    /// its configured share instead of the single treasury in `FeeConfig`.
    /// Passing an empty vector reverts to the single-treasury `FeeConfig`.
    pub fn set_fee_distribution(
        env: Env,
        admin: Address,
        shares: soroban_sdk::Vec<TreasuryShare>,
    ) -> Result<bool, EscrowError> {
        admin.require_auth();
        if !Self::is_admin(env.clone(), admin.clone()) {
            return Err(EscrowError::Unauthorized);
        }

        let mut total_bps: u32 = 0;
        for share in shares.iter() {
            total_bps = total_bps
                .checked_add(share.bps)
                .ok_or(EscrowError::InvalidFeeBps)?;
        }
        if total_bps > 1000 {
            return Err(EscrowError::InvalidFeeBps);
        }

        env.storage()
            .instance()
            .set(&DataKey::FeeDistribution, &shares);

        env.events().publish(
            (symbol_short!("escrow"), symbol_short!("feedist")),
            FeeDistributionSetEvent {
                admin,
                treasury_count: shares.len(),
                total_bps,
            },
        );

        Ok(true)
    }

    /// Get the current multi-treasury fee distribution. Empty when unset
    /// (i.e. the single-treasury `FeeConfig` is in effect).
    pub fn get_fee_distribution(env: Env) -> soroban_sdk::Vec<TreasuryShare> {
        env.storage()
            .instance()
            .get(&DataKey::FeeDistribution)
            .unwrap_or_else(|| soroban_sdk::Vec::new(&env))
    }

    /// Computes and transfers the release fee out of `amount`, splitting it
    /// across the configured multi-treasury distribution when one is set,
    /// falling back to the single-treasury `FeeConfig` otherwise. Returns
    /// the total fee amount deducted.
    fn distribute_fee(
        env: &Env,
        token_client: &soroban_sdk::token::Client,
        amount: i128,
    ) -> Result<i128, EscrowError> {
        let shares: soroban_sdk::Vec<TreasuryShare> = env
            .storage()
            .instance()
            .get(&DataKey::FeeDistribution)
            .unwrap_or_else(|| soroban_sdk::Vec::new(env));

        if !shares.is_empty() {
            let mut total_fee: i128 = 0;
            for share in shares.iter() {
                let bps = share.bps as i128;
                let fee = (amount / 10_000i128) * bps + ((amount % 10_000i128) * bps) / 10_000i128;
                if fee > 0 {
                    token_client.transfer(&env.current_contract_address(), &share.treasury, &fee);
                    total_fee += fee;
                }
            }
            Ok(total_fee)
        } else {
            let fee_config: FeeConfig = Self::get_fee_config(env.clone())?;
            let fee_bps = fee_config.fee_bps as i128;
            let fee =
                (amount / 10_000i128) * fee_bps + ((amount % 10_000i128) * fee_bps) / 10_000i128;
            if fee > 0 {
                token_client.transfer(&env.current_contract_address(), &fee_config.treasury, &fee);
            }
            Ok(fee)
        }
    }

    /// Add a token to the escrow whitelist. Admin-only.
    pub fn add_token(
        env: Env,
        admin: Address,
        token_address: Address,
    ) -> Result<bool, EscrowError> {
        admin.require_auth();
        if !Self::is_admin(env.clone(), admin.clone()) {
            return Err(EscrowError::Unauthorized);
        }

        if Self::is_token_allowed(env.clone(), token_address.clone()) {
            return Ok(true);
        }

        let mut whitelist: soroban_sdk::Vec<Address> = env
            .storage()
            .instance()
            .get(&DataKey::TokenWhitelist)
            .unwrap_or_else(|| soroban_sdk::Vec::new(&env));
        whitelist.push_back(token_address.clone());
        env.storage()
            .instance()
            .set(&DataKey::TokenWhitelist, &whitelist);
        env.storage()
            .instance()
            .set(&DataKey::TokenEnabled(token_address), &true);

        Ok(true)
    }

    /// Remove a token from the escrow whitelist. Admin-only.
    pub fn remove_token(
        env: Env,
        admin: Address,
        token_address: Address,
    ) -> Result<bool, EscrowError> {
        admin.require_auth();
        if !Self::is_admin(env.clone(), admin.clone()) {
            return Err(EscrowError::Unauthorized);
        }

        let mut whitelist: soroban_sdk::Vec<Address> = env
            .storage()
            .instance()
            .get(&DataKey::TokenWhitelist)
            .unwrap_or_else(|| soroban_sdk::Vec::new(&env));
        if let Some(index) = whitelist.first_index_of(&token_address) {
            whitelist.remove(index);
            env.storage()
                .instance()
                .set(&DataKey::TokenWhitelist, &whitelist);
        }
        env.storage()
            .instance()
            .set(&DataKey::TokenEnabled(token_address), &false);

        Ok(true)
    }

    /// Returns true when the token is approved for escrow deposits.
    pub fn is_token_allowed(env: Env, token_address: Address) -> bool {
        env.storage()
            .instance()
            .get(&DataKey::TokenEnabled(token_address))
            .unwrap_or(false)
    }

    /// List all tokens currently approved for escrow deposits.
    pub fn list_tokens(env: Env) -> soroban_sdk::Vec<Address> {
        env.storage()
            .instance()
            .get(&DataKey::TokenWhitelist)
            .unwrap_or_else(|| soroban_sdk::Vec::new(&env))
    }

    /// Fund the shared liquidity pool for a token so it can back instant
    /// settlements via `settle_from_pool`. Any account may contribute
    /// liquidity for a whitelisted token.
    pub fn fund_pool(
        env: Env,
        funder: Address,
        token: Address,
        amount: i128,
    ) -> Result<i128, EscrowError> {
        funder.require_auth();

        if !Self::is_token_allowed(env.clone(), token.clone()) {
            return Err(EscrowError::TokenNotWhitelisted);
        }
        if amount <= 0 {
            return Err(EscrowError::InvalidAmount);
        }

        let token_client = soroban_sdk::token::Client::new(&env, &token);
        token_client.transfer(&funder, &env.current_contract_address(), &amount);

        let pool_key = DataKey::LiquidityPool(token.clone());
        let mut pool: LiquidityPool =
            env.storage()
                .instance()
                .get(&pool_key)
                .unwrap_or(LiquidityPool {
                    token: token.clone(),
                    balance: 0,
                });
        pool.balance += amount;
        env.storage().instance().set(&pool_key, &pool);

        env.events().publish(
            (symbol_short!("escrow"), symbol_short!("pl_fund")),
            PoolFundedEvent {
                token,
                funder,
                amount,
                new_balance: pool.balance,
            },
        );

        Ok(pool.balance)
    }

    /// Withdraw liquidity from a token's pool. Admin-only.
    pub fn withdraw_from_pool(
        env: Env,
        admin: Address,
        token: Address,
        amount: i128,
    ) -> Result<i128, EscrowError> {
        admin.require_auth();
        if !Self::is_admin(env.clone(), admin.clone()) {
            return Err(EscrowError::Unauthorized);
        }
        if amount <= 0 {
            return Err(EscrowError::InvalidAmount);
        }

        let pool_key = DataKey::LiquidityPool(token.clone());
        let mut pool: LiquidityPool = env
            .storage()
            .instance()
            .get(&pool_key)
            .ok_or(EscrowError::PoolNotFound)?;

        if amount > pool.balance {
            return Err(EscrowError::InsufficientPoolBalance);
        }

        let token_client = soroban_sdk::token::Client::new(&env, &token);
        token_client.transfer(&env.current_contract_address(), &admin, &amount);

        pool.balance -= amount;
        env.storage().instance().set(&pool_key, &pool);

        env.events().publish(
            (symbol_short!("escrow"), symbol_short!("pl_wdrw")),
            PoolWithdrawnEvent {
                token,
                admin,
                amount,
                new_balance: pool.balance,
            },
        );

        Ok(pool.balance)
    }

    /// Instantly settle a funded escrow by paying the seller out of the
    /// shared liquidity pool for that escrow's token, instead of going
    /// through the ordinary buyer/admin-triggered `release` flow. Admin-only.
    ///
    /// The pool's tracked balance is left unchanged by a settlement: the
    /// amount it fronts to the seller is immediately backed by the settling
    /// escrow's own already-deposited funds, which remain held by this
    /// contract. `pool.balance` therefore always reflects real, currently
    /// unencumbered liquidity available to back further instant settlements.
    pub fn settle_from_pool(
        env: Env,
        escrow_id: u64,
        caller: Address,
    ) -> Result<bool, EscrowError> {
        caller.require_auth();
        if !Self::is_admin(env.clone(), caller.clone()) {
            return Err(EscrowError::Unauthorized);
        }

        let key = DataKey::Escrow(escrow_id);
        let mut record: EscrowRecord = match env.storage().persistent().get(&key) {
            Some(rec) => rec,
            None => return Err(EscrowError::NotFound),
        };

        if record.status != EscrowStatus::Funded {
            return Err(EscrowError::InvalidStatus);
        }

        let remaining = record.amount - record.released_amount;
        if remaining <= 0 {
            return Err(EscrowError::ZeroAmount);
        }

        let pool_key = DataKey::LiquidityPool(record.token.clone());
        let pool: LiquidityPool = env
            .storage()
            .instance()
            .get(&pool_key)
            .ok_or(EscrowError::PoolNotFound)?;
        if pool.balance < remaining {
            return Err(EscrowError::InsufficientPoolBalance);
        }

        let token_client = soroban_sdk::token::Client::new(&env, &record.token);
        token_client.transfer(&env.current_contract_address(), &record.seller, &remaining);

        record.released_amount = record.amount;
        record.status = EscrowStatus::Released;
        env.storage().persistent().set(&key, &record);

        env.events().publish(
            (symbol_short!("escrow"), symbol_short!("pl_stl")),
            PoolSettledEvent {
                escrow_id,
                token: record.token.clone(),
                seller: record.seller.clone(),
                amount: remaining,
            },
        );

        Ok(true)
    }

    /// Read-only getter for a token's liquidity pool balance.
    pub fn get_liquidity_pool(env: Env, token: Address) -> LiquidityPool {
        env.storage()
            .instance()
            .get(&DataKey::LiquidityPool(token.clone()))
            .unwrap_or(LiquidityPool { token, balance: 0 })
    }

    /// Create an escrow in unfunded `Created` status.
    ///
    /// Optional metadata parameters (order_hash and schema) can be provided to store
    /// a hash of off-chain order details for later verification.
    ///
    /// # Errors
    /// Returns [`EscrowError::InvalidAddress`] when buyer, seller, token, or
    /// treasury are the zero address, and
    /// [`EscrowError::InvalidEscrowParticipants`] when buyer and seller are
    /// the same address.
    pub fn create(
        env: Env,
        buyer: Address,
        seller: Address,
        token: Address,
        amount: i128,
        order_id: BytesN<32>,
        timeout_ledgers: u32,
        order_hash: Option<BytesN<32>>,
        schema: Option<Symbol>,
    ) -> Result<u64, EscrowError> {
        if is_zero_address(&env, &buyer)
            || is_zero_address(&env, &seller)
            || is_zero_address(&env, &token)
        {
            return Err(EscrowError::InvalidAddress);
        }
        if buyer == seller {
            return Err(EscrowError::InvalidEscrowParticipants);
        }

        buyer.require_auth();

        if let Some(pause_state) = env
            .storage()
            .instance()
            .get::<DataKey, EscrowPauseState>(&DataKey::PauseState)
        {
            if pause_state.create_paused {
                return Err(EscrowError::CreationPaused);
            }
        }

        if !Self::is_token_allowed(env.clone(), token.clone()) {
            return Err(EscrowError::TokenNotWhitelisted);
        }

        if amount <= 0 {
            return Err(EscrowError::InvalidAmount);
        }
        let limits: EscrowAmountLimits = Self::get_limits(env.clone())?;
        if amount < limits.min_amount {
            return Err(EscrowError::AmountBelowMin);
        }
        if amount > limits.max_amount {
            return Err(EscrowError::AmountAboveMax);
        }

        let mut last_id: u64 = env
            .storage()
            .instance()
            .get(&DataKey::LastEscrowId)
            .unwrap_or(0);
        last_id += 1;
        env.storage()
            .instance()
            .set(&DataKey::LastEscrowId, &last_id);

        let timeout_ledger = env.ledger().sequence() + timeout_ledgers;
        let record = EscrowRecord {
            escrow_id: last_id,
            buyer: buyer.clone(),
            seller: seller.clone(),
            token: token.clone(),
            amount,
            released_amount: 0,
            refunded_amount: 0,
            status: EscrowStatus::Created,
            order_id: order_id.clone(),
            created_at: env.ledger().timestamp(),
            timeout_ledger,
        };

        env.storage()
            .persistent()
            .set(&DataKey::Escrow(last_id), &record);

        if let (Some(hash), Some(sch)) = (order_hash, schema) {
            let metadata = EscrowMetadata {
                order_hash: hash.clone(),
                schema: sch.clone(),
            };
            env.storage()
                .persistent()
                .set(&DataKey::EscrowMetadata(last_id), &metadata);

            env.events().publish(
                (symbol_short!("escrow"), symbol_short!("metadata")),
                EscrowMetadataEvent {
                    escrow_id: order_id.clone(),
                    order_hash: hash,
                    schema: sch,
                },
            );
        }

        env.events().publish(
            (symbol_short!("escrow"), symbol_short!("created")),
            EscrowCreatedEvent {
                escrow_id: last_id,
                buyer: record.buyer.clone(),
                seller: record.seller.clone(),
                token: record.token.clone(),
                amount: record.amount,
                order_id,
                timeout_ledger,
            },
        );

        Ok(last_id)
    }

    /// Fund an existing escrow that is in `Created` status.
    pub fn fund(env: Env, escrow_id: u64, buyer: Address) -> Result<bool, EscrowError> {
        buyer.require_auth();

        let key = DataKey::Escrow(escrow_id);
        let mut record: EscrowRecord = match env.storage().persistent().get(&key) {
            Some(rec) => rec,
            None => return Err(EscrowError::NotFound),
        };

        if buyer != record.buyer {
            return Err(EscrowError::Unauthorized);
        }

        if record.status == EscrowStatus::Funded {
            return Err(EscrowError::AlreadyFunded);
        }

        if record.status == EscrowStatus::Cancelled {
            return Err(EscrowError::AlreadyCancelled);
        }

        if record.status != EscrowStatus::Created {
            return Err(EscrowError::InvalidStatus);
        }

        let token_client = soroban_sdk::token::Client::new(&env, &record.token);
        token_client.transfer(&buyer, &env.current_contract_address(), &record.amount);

        record.status = EscrowStatus::Funded;
        env.storage().persistent().set(&key, &record);

        Ok(true)
    }

    /// Cancel an escrow that has been created but not yet funded.
    /// Only the merchant (seller) may call.
    pub fn cancel(
        env: Env,
        escrow_id: u64,
        caller: Address,
        reason: Symbol,
    ) -> Result<bool, EscrowError> {
        caller.require_auth();

        let key = DataKey::Escrow(escrow_id);
        let mut record: EscrowRecord = match env.storage().persistent().get(&key) {
            Some(rec) => rec,
            None => return Err(EscrowError::NotFound),
        };

        if caller != record.seller {
            return Err(EscrowError::Unauthorized);
        }

        if record.status == EscrowStatus::Funded {
            return Err(EscrowError::AlreadyFunded);
        }

        if record.status == EscrowStatus::Cancelled {
            return Err(EscrowError::AlreadyCancelled);
        }

        if record.status != EscrowStatus::Created {
            return Err(EscrowError::InvalidStatus);
        }

        record.status = EscrowStatus::Cancelled;
        env.storage().persistent().set(&key, &record);

        env.events().publish(
            (symbol_short!("escrow"), symbol_short!("cancelled")),
            EscrowCancelledEvent {
                escrow_id: record.order_id.clone(),
                cancelled_by: caller,
                reason,
            },
        );

        Ok(true)
    }

    /// Deposit funds into escrow for an order.
    /// Combined convenience call: creates an escrow and immediately funds it.
    pub fn deposit(
        env: Env,
        buyer: Address,
        seller: Address,
        token: Address,
        amount: i128,
        order_id: BytesN<32>,
        timeout_ledgers: u32,
        order_hash: Option<BytesN<32>>,
        schema: Option<Symbol>,
    ) -> Result<u64, EscrowError> {
        let escrow_id = Self::create(
            env.clone(),
            buyer.clone(),
            seller,
            token.clone(),
            amount,
            order_id,
            timeout_ledgers,
            order_hash,
            schema,
        )?;

        let key = DataKey::Escrow(escrow_id);
        let mut record: EscrowRecord = env.storage().persistent().get(&key).unwrap();

        let token_client = soroban_sdk::token::Client::new(&env, &token);
        token_client.transfer(&buyer, &env.current_contract_address(), &amount);

        record.status = EscrowStatus::Funded;
        env.storage().persistent().set(&key, &record);

        Ok(escrow_id)
    }

    /// Release a partial amount to the seller.
    /// `release_amount` must be <= (record.amount - record.released_amount).
    /// If release_amount equals the remaining balance, set status to Released.
    pub fn partial_release(
        env: Env,
        escrow_id: u64,
        caller: Address,
        release_amount: i128,
    ) -> Result<PartialReleaseResult, EscrowError> {
        caller.require_auth();

        let key = DataKey::Escrow(escrow_id);
        let record: EscrowRecord = match env.storage().persistent().get(&key) {
            Some(rec) => rec,
            None => return Err(EscrowError::NotFound),
        };

        if caller != record.buyer && !Self::is_admin(env.clone(), caller.clone()) {
            return Err(EscrowError::Unauthorized);
        }

        check_not_terminal(&record)?;

        if record.status != EscrowStatus::Funded {
            return Err(EscrowError::InvalidStatus);
        }
        Self::validate_release_status(&record)?;

        Self::execute_release(&env, escrow_id, &key, record, caller, release_amount)
    }

    /// Shared release logic used by both `partial_release` and
    /// `evaluate_and_release`. Callers are responsible for their own
    /// authorization checks before invoking this.
    fn execute_release(
        env: &Env,
        escrow_id: u64,
        key: &DataKey,
        mut record: EscrowRecord,
        caller: Address,
        release_amount: i128,
    ) -> Result<PartialReleaseResult, EscrowError> {
        if release_amount <= 0 {
            return Err(EscrowError::ZeroAmount);
        }

        let remaining = record.amount - record.released_amount;
        if release_amount > remaining {
            return Err(EscrowError::InsufficientEscrowBalance);
        }

        let token_client = soroban_sdk::token::Client::new(env, &record.token);
        token_client.transfer(
            &env.current_contract_address(),
            &record.seller,
            &release_amount,
        );

        record.released_amount += release_amount;
        let new_remaining = record.amount - record.released_amount;
        let fully_released = new_remaining == 0;
        if fully_released {
            record.status = EscrowStatus::Released;
        }

        env.storage().persistent().set(key, &record);

        env.events().publish(
            (symbol_short!("escrow"), symbol_short!("released")),
            EscrowReleasedEvent {
                escrow_id,
                seller: record.seller.clone(),
                amount: release_amount,
                released_by: caller,
            },
        );

        if fully_released {
            let yield_config: Option<YieldConfig> = env
                .storage()
                .persistent()
                .get(&DataKey::EscrowYieldConfig(escrow_id));
            if let Some(cfg) = &yield_config {
                let (yield_amount, held_seconds) = Self::compute_yield(&record, Some(cfg), env);
                env.events().publish(
                    (symbol_short!("escrow"), symbol_short!("yield")),
                    EscrowYieldAccruedEvent {
                        escrow_id,
                        seller: record.seller.clone(),
                        yield_amount,
                        held_seconds,
                    },
                );
            }
        }

        Ok(PartialReleaseResult {
            released: release_amount,
            remaining: new_remaining,
            fully_released,
        })
    }

    /// Release escrowed funds to the seller. Only the buyer or admin may call.
    pub fn release(
        env: Env,
        escrow_id: u64,
        caller: Address,
        recipient: Address,
    ) -> Result<bool, EscrowError> {
        let key = DataKey::Escrow(escrow_id);
        let record: EscrowRecord = match env.storage().persistent().get(&key) {
            Some(rec) => rec,
            None => return Err(EscrowError::NotFound),
        };

        if recipient != record.seller {
            return Err(EscrowError::InvalidReleaseRecipient);
        }

        let remaining = record.amount - record.released_amount;
        Self::partial_release(env, escrow_id, caller, remaining)?;
        Ok(true)
    }

    /// Refund escrowed funds to the buyer.
    /// Seller or admin may refund at any time; the buyer may refund after timeout.
    /// Refunds the full remaining (unreleased, unrefunded) balance.
    pub fn refund(env: Env, escrow_id: u64, caller: Address) -> Result<bool, EscrowError> {
        let key = DataKey::Escrow(escrow_id);
        let record: EscrowRecord = match env.storage().persistent().get(&key) {
            Some(rec) => rec,
            None => return Err(EscrowError::NotFound),
        };

        let remaining = record.amount - record.released_amount - record.refunded_amount;
        Self::partial_refund(env, escrow_id, caller, remaining)?;
        Ok(true)
    }

    /// Refund a partial amount to the buyer.
    /// `refund_amount` must be <= (record.amount - record.released_amount - record.refunded_amount).
    /// Status remains `Funded` unless the refund exhausts the remaining balance, in
    /// which case status becomes `Refunded`.
    /// Seller or admin may refund at any time; the buyer may refund after timeout.
    pub fn partial_refund(
        env: Env,
        escrow_id: u64,
        caller: Address,
        refund_amount: i128,
    ) -> Result<PartialRefundResult, EscrowError> {
        caller.require_auth();

        let key = DataKey::Escrow(escrow_id);
        let mut record: EscrowRecord = match env.storage().persistent().get(&key) {
            Some(rec) => rec,
            None => return Err(EscrowError::NotFound),
        };

        check_not_terminal(&record)?;

        if record.status != EscrowStatus::Funded {
            return Err(EscrowError::InvalidStatus);
        }

        let timeout_reached = env.ledger().sequence() >= record.timeout_ledger;

        if caller == record.seller || Self::is_admin(env.clone(), caller.clone()) {
            // Authorized at any time while funded.
        } else if caller == record.buyer {
            if !timeout_reached {
                return Err(EscrowError::TimeoutNotReached);
            }
        } else {
            return Err(EscrowError::Unauthorized);
        }

        if refund_amount <= 0 {
            return Err(EscrowError::ZeroAmount);
        }

        let remaining = record.amount - record.released_amount - record.refunded_amount;
        if refund_amount > remaining {
            return Err(EscrowError::InsufficientEscrowBalance);
        }

        let token_client = soroban_sdk::token::Client::new(&env, &record.token);
        token_client.transfer(
            &env.current_contract_address(),
            &record.buyer,
            &refund_amount,
        );

        record.refunded_amount += refund_amount;
        let new_remaining = record.amount - record.released_amount - record.refunded_amount;
        let fully_refunded = new_remaining == 0;
        if fully_refunded {
            record.status = EscrowStatus::Refunded;
        }

        env.storage().persistent().set(&key, &record);

        env.events().publish(
            (symbol_short!("escrow"), symbol_short!("refunded")),
            EscrowRefundedEvent {
                escrow_id,
                buyer: record.buyer.clone(),
                amount: refund_amount,
                remaining: new_remaining,
                refunded_by: caller,
            },
        );

        Ok(PartialRefundResult {
            refunded: refund_amount,
            remaining: new_remaining,
            fully_refunded,
        })
    }

    /// Configure a conditional release for an escrow, gated on an external oracle
    /// contract (issue #339). Callable by the buyer, seller, or admin while the
    /// escrow is not in a terminal state.
    ///
    /// `oracle_contract` must implement `resolve(condition_type: Symbol) -> bool`.
    /// `evaluate_and_release` calls this function and releases funds to the
    /// seller only when it returns `true`.
    pub fn set_release_condition(
        env: Env,
        caller: Address,
        escrow_id: u64,
        condition_type: Symbol,
        oracle_contract: Address,
    ) -> Result<bool, EscrowError> {
        caller.require_auth();

        let key = DataKey::Escrow(escrow_id);
        let record: EscrowRecord = match env.storage().persistent().get(&key) {
            Some(rec) => rec,
            None => return Err(EscrowError::NotFound),
        };

        if caller != record.buyer
            && caller != record.seller
            && !Self::is_admin(env.clone(), caller.clone())
        {
            return Err(EscrowError::Unauthorized);
        }

        check_not_terminal(&record)?;

        env.storage().persistent().set(
            &DataKey::ReleaseCondition(escrow_id),
            &ReleaseCondition {
                condition_type: condition_type.clone(),
                oracle_contract: oracle_contract.clone(),
            },
        );

        env.events().publish(
            (symbol_short!("escrow"), symbol_short!("condset")),
            ReleaseConditionSetEvent {
                escrow_id,
                condition_type,
                oracle_contract,
            },
        );

        Ok(true)
    }

    /// Read-only getter for the release condition configured on an escrow.
    pub fn get_release_condition(
        env: Env,
        escrow_id: u64,
    ) -> Result<ReleaseCondition, EscrowError> {
        env.storage()
            .persistent()
            .get(&DataKey::ReleaseCondition(escrow_id))
            .ok_or(EscrowError::ReleaseConditionNotSet)
    }

    /// Query the configured oracle and release the full remaining balance to the
    /// seller if the condition it reports is met (issue #339).
    ///
    /// Any caller may trigger evaluation once a condition has been configured via
    /// `set_release_condition` — authorization to move funds comes from the
    /// oracle's answer, not from the caller's identity. The oracle call is made
    /// via `try_invoke_contract` so a missing contract, a wrong/missing
    /// `resolve` function, or a panic inside the oracle all surface as
    /// `EscrowError::OracleCallFailed` instead of aborting this transaction.
    pub fn evaluate_and_release(
        env: Env,
        escrow_id: u64,
        caller: Address,
    ) -> Result<PartialReleaseResult, EscrowError> {
        caller.require_auth();

        let key = DataKey::Escrow(escrow_id);
        let record: EscrowRecord = match env.storage().persistent().get(&key) {
            Some(rec) => rec,
            None => return Err(EscrowError::NotFound),
        };

        check_not_terminal(&record)?;
        if record.status != EscrowStatus::Funded {
            return Err(EscrowError::InvalidStatus);
        }

        let condition: ReleaseCondition = env
            .storage()
            .persistent()
            .get(&DataKey::ReleaseCondition(escrow_id))
            .ok_or(EscrowError::ReleaseConditionNotSet)?;

        let args = soroban_sdk::vec![&env, condition.condition_type.to_val()];
        let call_result = env.try_invoke_contract::<bool, InvokeError>(
            &condition.oracle_contract,
            &symbol_short!("resolve"),
            args,
        );

        let condition_met = match call_result {
            Ok(Ok(met)) => met,
            _ => return Err(EscrowError::OracleCallFailed),
        };

        if !condition_met {
            return Err(EscrowError::ConditionNotMet);
        }

        let remaining = record.amount - record.released_amount;
        Self::execute_release(&env, escrow_id, &key, record, caller, remaining)
    }

    /// Mark the escrow as disputed. Only the buyer or seller may call.
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

        if record.status != EscrowStatus::Funded {
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

    /// Resolve a disputed escrow. Only the admin may call.
    pub fn resolve_dispute(
        env: Env,
        escrow_id: u64,
        caller: Address,
        release_to_seller: bool,
    ) -> Result<bool, EscrowError> {
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
            let fee = Self::distribute_fee(&env, &token_client, record.amount)?;
            let seller_amount = record.amount - fee;

            token_client.transfer(
                &env.current_contract_address(),
                &record.seller,
                &seller_amount,
            );
            record.status = EscrowStatus::Released;
        } else {
            token_client.transfer(
                &env.current_contract_address(),
                &record.buyer,
                &record.amount,
            );
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

    /// Read-only helper for settlement workers to determine whether release can proceed.
    ///
    /// Reason symbols (≤9 chars for `symbol_short!` compat):
    ///   `ok`       — escrow is funded and not timed out
    ///   `notfound` — escrow record does not exist
    ///   `released` — already released (terminal)
    ///   `refunded` — already refunded (terminal)
    ///   `disputed` — escrow is under dispute
    ///   `timeout`  — refund timeout has been reached
    pub fn get_release_eligibility(env: Env, escrow_id: u64) -> ReleaseEligibility {
        let key = DataKey::Escrow(escrow_id);
        let record: EscrowRecord = match env.storage().persistent().get(&key) {
            Some(rec) => rec,
            None => {
                return ReleaseEligibility {
                    escrow_id: BytesN::from_array(&env, &[0u8; 32]),
                    eligible: false,
                    reason: symbol_short!("notfound"),
                };
            }
        };

        let reason = match Self::release_block_reason(env, &record) {
            Some(reason) => reason,
            None => symbol_short!("ok"),
        };

        ReleaseEligibility {
            escrow_id: record.order_id,
            eligible: reason == symbol_short!("ok"),
            reason,
        }
    }

    /// Read-only getter for escrow state.
    pub fn get_escrow(env: Env, escrow_id: u64) -> EscrowRecord {
        let key = DataKey::Escrow(escrow_id);
        env.storage()
            .persistent()
            .get(&key)
            .expect("Escrow not found")
    }

    /// Read-only buyer-facing receipt for an escrow.
    ///
    /// Returns a compact [`EscrowReceipt`] containing the identifiers and
    /// current status that a backend service can forward to the buyer after
    /// escrow creation or as a status check.  The full record (amount, token,
    /// timeout, …) is available via [`get_escrow`].
    ///
    /// # Errors
    /// Returns [`EscrowError::NotFound`] when no escrow exists for `escrow_id`.
    pub fn get_receipt(env: Env, escrow_id: u64) -> Result<EscrowReceipt, EscrowError> {
        let key = DataKey::Escrow(escrow_id);
        let record: EscrowRecord = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(EscrowError::NotFound)?;
        Ok(EscrowReceipt {
            escrow_id: record.escrow_id,
            buyer: record.buyer,
            seller: record.seller,
            order_id: record.order_id,
            status: record.status,
        })
    }

    /// Read-only merchant-facing receipt for dashboards and settlement checks.
    ///
    /// Returns a [`MerchantEscrowReceipt`] with the order id as `escrow_id`,
    /// the seller as `merchant`, and a computed `release_eligible` flag that
    /// does not mutate contract state.
    ///
    /// # Errors
    /// Returns [`EscrowError::NotFound`] when no escrow exists for `escrow_id`.
    pub fn get_merchant_receipt(
        env: Env,
        escrow_id: u64,
    ) -> Result<MerchantEscrowReceipt, EscrowError> {
        let key = DataKey::Escrow(escrow_id);
        let record: EscrowRecord = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(EscrowError::NotFound)?;
        let release_eligible = Self::release_block_reason(env, &record).is_none();
        Ok(MerchantEscrowReceipt {
            escrow_id: record.order_id,
            merchant: record.seller,
            buyer: record.buyer,
            status: record.status,
            release_eligible,
        })
    }

    /// Read-only complete state snapshot of an escrow (issue #329).
    ///
    /// Aggregates the full escrow record, the fee configuration applied to
    /// it, and computed fields (current timeout status and release
    /// eligibility) in a single call, so off-chain indexers and auditors
    /// don't have to replay contract events to reconstruct current state.
    /// Never mutates storage.
    ///
    /// # Errors
    /// Returns [`EscrowError::NotFound`] when no escrow exists for `escrow_id`.
    pub fn get_escrow_snapshot(env: Env, escrow_id: u64) -> Result<EscrowSnapshot, EscrowError> {
        let key = DataKey::Escrow(escrow_id);
        let record: EscrowRecord = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(EscrowError::NotFound)?;

        let fee_config: FeeConfig = Self::get_fee_config(env.clone())?;
        let current_ledger = env.ledger().sequence();
        let timed_out =
            record.status == EscrowStatus::Funded && current_ledger >= record.timeout_ledger;
        let release_eligible = Self::release_block_reason(env.clone(), &record).is_none();

        Ok(EscrowSnapshot {
            record,
            fee_config,
            current_ledger,
            timed_out,
            release_eligible,
        })
    }

    /// Configure optional yield accrual for an escrow (issue #331). Admin-only.
    ///
    /// `apr_bps` is the annual yield rate in basis points (max 10000 = 100%).
    /// Yield is prorated by the actual time the escrow is held and reported
    /// via [`EscrowYieldAccruedEvent`] when the escrow is fully released.
    ///
    /// # Errors
    /// - [`EscrowError::Unauthorized`] if `admin` is not an escrow admin.
    /// - [`EscrowError::InvalidYieldConfig`] if `apr_bps` exceeds 10000.
    /// - [`EscrowError::NotFound`] if `escrow_id` does not exist.
    /// - Any terminal-state error from [`check_not_terminal`] once the
    ///   escrow has already been released, refunded, or cancelled.
    pub fn set_yield_config(
        env: Env,
        admin: Address,
        escrow_id: u64,
        lending_contract: Address,
        apr_bps: u32,
    ) -> Result<bool, EscrowError> {
        admin.require_auth();
        if !Self::is_admin(env.clone(), admin.clone()) {
            return Err(EscrowError::Unauthorized);
        }
        if apr_bps > 10_000 {
            return Err(EscrowError::InvalidYieldConfig);
        }

        let key = DataKey::Escrow(escrow_id);
        let record: EscrowRecord = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(EscrowError::NotFound)?;
        check_not_terminal(&record)?;

        env.storage().persistent().set(
            &DataKey::EscrowYieldConfig(escrow_id),
            &YieldConfig {
                lending_contract,
                apr_bps,
            },
        );

        Ok(true)
    }

    /// Read-only view of the yield an escrow has accrued so far, based on
    /// the time it has been held (issue #331). Returns zero accrued yield
    /// when no `YieldConfig` is set. Never mutates storage.
    ///
    /// # Errors
    /// Returns [`EscrowError::NotFound`] when no escrow exists for `escrow_id`.
    pub fn get_accrued_yield(env: Env, escrow_id: u64) -> Result<EscrowYieldView, EscrowError> {
        let key = DataKey::Escrow(escrow_id);
        let record: EscrowRecord = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(EscrowError::NotFound)?;

        let yield_config: Option<YieldConfig> = env
            .storage()
            .persistent()
            .get(&DataKey::EscrowYieldConfig(escrow_id));
        let apr_bps = yield_config.as_ref().map(|c| c.apr_bps).unwrap_or(0);
        let (accrued_yield, _) = Self::compute_yield(&record, yield_config.as_ref(), &env);

        Ok(EscrowYieldView {
            escrow_id,
            accrued_yield,
            apr_bps,
        })
    }

    /// Propose a new primary admin. Must be called by current primary admin.
    pub fn propose_admin(
        env: Env,
        current_admin: Address,
        new_admin: Address,
    ) -> Result<bool, EscrowError> {
        current_admin.require_auth();
        let primary_admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(EscrowError::NotFound)?;
        if current_admin != primary_admin {
            return Err(EscrowError::Unauthorized);
        }
        env.storage()
            .instance()
            .set(&DataKey::PendingAdmin, &new_admin);
        env.events().publish(
            (symbol_short!("admin"), symbol_short!("proposed")),
            AdminProposedEvent {
                current_admin,
                new_admin,
            },
        );
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
            env.storage()
                .instance()
                .set(&DataKey::AdminList, &admin_list);
        }

        env.storage().instance().set(&DataKey::Admin, &new_admin);
        env.storage().instance().remove(&DataKey::PendingAdmin);
        env.events().publish(
            (symbol_short!("admin"), symbol_short!("accepted")),
            AdminAcceptedEvent { new_admin },
        );
        Ok(true)
    }

    /// Cancel a pending admin transfer. Must be called by current primary admin.
    pub fn cancel_admin_transfer(env: Env, current_admin: Address) -> Result<bool, EscrowError> {
        current_admin.require_auth();
        let primary_admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(EscrowError::NotFound)?;
        if current_admin != primary_admin {
            return Err(EscrowError::Unauthorized);
        }
        if !env.storage().instance().has(&DataKey::PendingAdmin) {
            return Err(EscrowError::NoPendingTransfer);
        }
        env.storage().instance().remove(&DataKey::PendingAdmin);
        env.events().publish(
            (symbol_short!("admin"), symbol_short!("cancelled")),
            AdminTransferCancelledEvent { current_admin },
        );
        Ok(true)
    }

    /// Add a co-admin. Must be called by the primary admin.
    pub fn add_co_admin(
        env: Env,
        admin: Address,
        new_co_admin: Address,
    ) -> Result<bool, EscrowError> {
        admin.require_auth();
        let primary_admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(EscrowError::NotFound)?;
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
        env.storage()
            .instance()
            .set(&DataKey::AdminList, &admin_list);
        Ok(true)
    }

    /// Remove a co-admin. Must be called by the primary admin.
    pub fn remove_co_admin(
        env: Env,
        admin: Address,
        co_admin: Address,
    ) -> Result<bool, EscrowError> {
        admin.require_auth();
        let primary_admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(EscrowError::NotFound)?;
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
        env.storage()
            .instance()
            .set(&DataKey::AdminList, &admin_list);
        Ok(true)
    }

    /// Set or clear the admin pause flag for new escrow creation. Admin-only.
    pub fn set_create_paused(env: Env, admin: Address, paused: bool) -> Result<bool, EscrowError> {
        admin.require_auth();
        if !Self::is_admin(env.clone(), admin.clone()) {
            return Err(EscrowError::Unauthorized);
        }
        let pause_state = EscrowPauseState {
            create_paused: paused,
            updated_by: admin.clone(),
            updated_at_ledger: env.ledger().sequence(),
            expires_at_ledger: None,
        };
        env.storage()
            .instance()
            .set(&DataKey::PauseState, &pause_state);
        env.events().publish(
            (symbol_short!("escrow"), symbol_short!("paused")),
            EscrowPauseChangedEvent {
                paused,
                admin,
                ledger: env.ledger().sequence(),
            },
        );
        Ok(true)
    }

    /// Set an emergency pause with automatic expiry after specified duration in ledgers.
    /// Admin-only. The pause auto-expires after `duration_ledgers` ledgers.
    pub fn set_emergency_pause(
        env: Env,
        admin: Address,
        paused: bool,
        duration_ledgers: u32,
    ) -> Result<bool, EscrowError> {
        admin.require_auth();
        if !Self::is_admin(env.clone(), admin.clone()) {
            return Err(EscrowError::Unauthorized);
        }
        let current_ledger = env.ledger().sequence();
        let expires_at = if paused && duration_ledgers > 0 {
            Some(current_ledger.saturating_add(duration_ledgers))
        } else {
            None
        };
        let pause_state = EscrowPauseState {
            create_paused: paused,
            updated_by: admin.clone(),
            updated_at_ledger: current_ledger,
            expires_at_ledger: expires_at,
        };
        env.storage()
            .instance()
            .set(&DataKey::PauseState, &pause_state);
        env.events().publish(
            (symbol_short!("escrow"), symbol_short!("paused")),
            EscrowPauseChangedEvent {
                paused,
                admin,
                ledger: current_ledger,
            },
        );
        Ok(true)
    }

    /// Get the current escrow creation pause state.
    /// Returns false if pause has expired.
    pub fn get_create_paused(env: Env) -> bool {
        env.storage()
            .instance()
            .get::<DataKey, EscrowPauseState>(&DataKey::PauseState)
            .map(|s| {
                if let Some(expires_at) = s.expires_at_ledger {
                    s.create_paused && env.ledger().sequence() < expires_at
                } else {
                    s.create_paused
                }
            })
            .unwrap_or(false)
    }

    /// Get the token address associated with an escrow.
    pub fn get_token(env: Env, escrow_id: u64) -> Result<EscrowTokenView, EscrowError> {
        let key = DataKey::Escrow(escrow_id);
        let record: EscrowRecord = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(EscrowError::NotFound)?;
        Ok(EscrowTokenView {
            escrow_id,
            token: record.token,
        })
    }

    /// Get the optional metadata for an escrow.
    ///
    /// Returns the metadata if it was provided during escrow creation, otherwise
    /// returns NotFound. The metadata contains the order hash and schema identifier
    /// for off-chain order verification.
    pub fn get_escrow_metadata(env: Env, escrow_id: u64) -> Result<EscrowMetadata, EscrowError> {
        let key = DataKey::EscrowMetadata(escrow_id);
        env.storage()
            .persistent()
            .get(&key)
            .ok_or(EscrowError::NotFound)
    }

    /// Returns true if the address is the primary admin or a co-admin.
    /// Read-only check: returns whether the given caller is eligible to refund
    /// the specified escrow, and a machine-readable reason symbol (issue #173).
    ///
    /// Reason symbols (≤7 chars for `symbol_short!` compat):
    ///   `ok`       — caller may refund right now
    ///   `notfund`  — escrow not found
    ///   `released` — already released (terminal)
    ///   `refunded` — already refunded (terminal)
    ///   `disputed` — escrow is under dispute
    ///   `noauth`   — caller is not buyer/seller/admin
    ///   `timeout`  — buyer must wait for timeout
    pub fn get_refund_eligibility(env: Env, escrow_id: u64, caller: Address) -> RefundEligibility {
        let key = DataKey::Escrow(escrow_id);
        let record: EscrowRecord = match env.storage().persistent().get(&key) {
            Some(rec) => rec,
            None => {
                return RefundEligibility {
                    escrow_id,
                    eligible: false,
                    reason: symbol_short!("notfund"),
                };
            }
        };

        // Terminal states
        if record.status == EscrowStatus::Released {
            return RefundEligibility {
                escrow_id,
                eligible: false,
                reason: symbol_short!("released"),
            };
        }
        if record.status == EscrowStatus::Refunded {
            return RefundEligibility {
                escrow_id,
                eligible: false,
                reason: symbol_short!("refunded"),
            };
        }
        if record.status == EscrowStatus::Cancelled {
            return RefundEligibility {
                escrow_id,
                eligible: false,
                reason: symbol_short!("cancelled"),
            };
        }
        if record.status == EscrowStatus::Created {
            return RefundEligibility {
                escrow_id,
                eligible: false,
                reason: symbol_short!("unfunded"),
            };
        }
        if record.status == EscrowStatus::Disputed {
            return RefundEligibility {
                escrow_id,
                eligible: false,
                reason: symbol_short!("disputed"),
            };
        }

        // Must be Funded at this point
        let is_seller = caller == record.seller;
        let is_buyer = caller == record.buyer;
        let is_admin = Self::is_admin(env.clone(), caller.clone());

        if is_seller || is_admin {
            return RefundEligibility {
                escrow_id,
                eligible: true,
                reason: symbol_short!("ok"),
            };
        }

        if is_buyer {
            let timeout_reached = env.ledger().sequence() >= record.timeout_ledger;
            if timeout_reached {
                return RefundEligibility {
                    escrow_id,
                    eligible: true,
                    reason: symbol_short!("ok"),
                };
            } else {
                return RefundEligibility {
                    escrow_id,
                    eligible: false,
                    reason: symbol_short!("timeout"),
                };
            }
        }

        RefundEligibility {
            escrow_id,
            eligible: false,
            reason: symbol_short!("noauth"),
        }
    }

    /// Read-only timeout metadata for a single escrow (issue #88).
    ///
    /// Returns the timeout ledger, the current ledger, and whether the buyer
    /// is currently eligible to trigger a refund based purely on the timeout.
    /// The getter does **not** mutate any contract state — safe to call at any
    /// time without auth.
    ///
    /// `refundable` is `true` only when the escrow is still `Funded` **and**
    /// `current_ledger >= timeout_ledger`.  Terminal states (`Released`,
    /// `Refunded`) and disputed escrows always return `refundable: false`.
    ///
    /// # Errors
    /// Returns [`EscrowError::NotFound`] when no escrow exists for `escrow_id`.
    pub fn get_timeout_view(env: Env, escrow_id: u64) -> Result<EscrowTimeoutView, EscrowError> {
        let key = DataKey::Escrow(escrow_id);
        let record: EscrowRecord = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(EscrowError::NotFound)?;

        let current_ledger = env.ledger().sequence();
        let timeout_ledger = record.timeout_ledger;

        // Only a Funded escrow can become refundable via timeout.
        // Released, Refunded, and Disputed states are not refundable here.
        let refundable = record.status == EscrowStatus::Funded && current_ledger >= timeout_ledger;

        Ok(EscrowTimeoutView {
            escrow_id: record.order_id,
            timeout_ledger,
            current_ledger,
            refundable,
        })
    }

    fn validate_release_status(record: &EscrowRecord) -> Result<(), EscrowError> {
        if record.status == EscrowStatus::Released {
            return Err(EscrowError::AlreadyReleased);
        }

        if record.status != EscrowStatus::Funded {
            return Err(EscrowError::InvalidStatus);
        }

        Ok(())
    }

    /// Computes yield accrued on an escrow's principal for the time it has
    /// been held, based on the given `YieldConfig` APR. Returns
    /// `(yield_amount, held_seconds)`; `(0, 0)` when no yield config is set.
    fn compute_yield(
        record: &EscrowRecord,
        yield_config: Option<&YieldConfig>,
        env: &Env,
    ) -> (i128, u64) {
        match yield_config {
            Some(cfg) => {
                let held_seconds = env.ledger().timestamp().saturating_sub(record.created_at);
                let yield_amount = (record.amount * cfg.apr_bps as i128 * held_seconds as i128)
                    / (10_000i128 * SECONDS_PER_YEAR);
                (yield_amount, held_seconds)
            }
            None => (0, 0),
        }
    }

    fn release_block_reason(env: Env, record: &EscrowRecord) -> Option<Symbol> {
        match record.status {
            EscrowStatus::Funded => {
                if env.ledger().sequence() >= record.timeout_ledger {
                    Some(symbol_short!("timeout"))
                } else {
                    None
                }
            }
            EscrowStatus::Created => Some(symbol_short!("unfunded")),
            EscrowStatus::Released => Some(symbol_short!("released")),
            EscrowStatus::Refunded => Some(symbol_short!("refunded")),
            EscrowStatus::Disputed => Some(symbol_short!("disputed")),
            EscrowStatus::Cancelled => Some(symbol_short!("cancelled")),
        }
    }

    /// Release escrowed funds split among multiple recipients (#321).
    ///
    /// `shares` is a list of `(recipient, amount)` pairs. The sum of all
    /// amounts must not exceed the remaining escrow balance. A platform fee
    /// is deducted from each individual share before transfer.
    /// Only the buyer or an admin may call this.
    pub fn split_release(
        env: Env,
        escrow_id: u64,
        caller: Address,
        shares: Vec<(Address, i128)>,
    ) -> Result<bool, EscrowError> {
        caller.require_auth();

        let key = DataKey::Escrow(escrow_id);
        let mut record: EscrowRecord = match env.storage().persistent().get(&key) {
            Some(rec) => rec,
            None => return Err(EscrowError::NotFound),
        };

        if caller != record.buyer && !Self::is_admin(env.clone(), caller.clone()) {
            return Err(EscrowError::Unauthorized);
        }

        check_not_terminal(&record)?;

        if record.status != EscrowStatus::Funded {
            return Err(EscrowError::InvalidStatus);
        }

        // Validate total split amount
        let remaining = record.amount - record.released_amount;
        let mut total: i128 = 0;
        for (_, amount) in shares.iter() {
            if amount <= 0 {
                return Err(EscrowError::InvalidAmount);
            }
            total += amount;
        }
        if total > remaining {
            return Err(EscrowError::InsufficientEscrowBalance);
        }

        let fee_config: FeeConfig = Self::get_fee_config(env.clone())?;
        let token_client = soroban_sdk::token::Client::new(&env, &record.token);
        let fee_bps = fee_config.fee_bps as i128;

        let mut total_fee: i128 = 0;
        let mut total_released: i128 = 0;

        for (recipient, amount) in shares.iter() {
            let fee =
                (amount / 10_000i128) * fee_bps + ((amount % 10_000i128) * fee_bps) / 10_000i128;
            let net = amount - fee;

            if fee > 0 {
                token_client.transfer(&env.current_contract_address(), &fee_config.treasury, &fee);
            }
            token_client.transfer(&env.current_contract_address(), &recipient, &net);

            total_fee += fee;
            total_released += amount;
        }

        record.released_amount += total_released;
        let new_remaining = record.amount - record.released_amount;
        if new_remaining == 0 {
            record.status = EscrowStatus::Released;
        }
        env.storage().persistent().set(&key, &record);

        env.events().publish(
            (symbol_short!("escrow"), symbol_short!("splitrel")),
            EscrowSplitReleasedEvent {
                escrow_id,
                recipient_count: shares.len(),
                total_released,
                fee_charged: total_fee,
                released_by: caller,
            },
        );

        Ok(true)
    }

    /// Extend the timeout ledger of a `Funded` escrow (#323).
    ///
    /// Requires mutual authentication from both buyer and seller (both must
    /// sign the transaction), OR unilateral authorization from an admin.
    /// `new_timeout_ledger` must be strictly greater than the current value.
    pub fn extend_timeout(
        env: Env,
        escrow_id: u64,
        caller: Address,
        new_timeout_ledger: u32,
    ) -> Result<bool, EscrowError> {
        caller.require_auth();

        let key = DataKey::Escrow(escrow_id);
        let mut record: EscrowRecord = match env.storage().persistent().get(&key) {
            Some(rec) => rec,
            None => return Err(EscrowError::NotFound),
        };

        if record.status != EscrowStatus::Funded {
            return Err(EscrowError::InvalidStatus);
        }

        if new_timeout_ledger <= record.timeout_ledger {
            return Err(EscrowError::InvalidAmount);
        }

        // Authorization: admin can do it alone; otherwise both buyer AND seller must sign.
        if !Self::is_admin(env.clone(), caller.clone()) {
            // Caller must be either buyer or seller, and both must authenticate.
            if caller != record.buyer && caller != record.seller {
                return Err(EscrowError::Unauthorized);
            }
            record.buyer.require_auth();
            record.seller.require_auth();
        }

        let old_timeout = record.timeout_ledger;
        record.timeout_ledger = new_timeout_ledger;
        env.storage().persistent().set(&key, &record);

        env.events().publish(
            (symbol_short!("escrow"), symbol_short!("exttime")),
            EscrowTimeoutExtendedEvent {
                escrow_id,
                old_timeout_ledger: old_timeout,
                new_timeout_ledger,
                extended_by: caller,
            },
        );

        Ok(true)
    }

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

    // ── Ticket 1: clear_release_condition ────────────────────────────────────

    /// Remove the release condition for an escrow. Admin or co-admin only.
    ///
    /// Useful when the configured oracle becomes unavailable or the condition
    /// is no longer required. Blocked on escrows that have already reached a
    /// terminal state (Released or Refunded) — those escrows are already
    /// settled so clearing the condition would have no effect and signals a
    /// caller logic error.
    ///
    /// # Errors
    /// - [`EscrowError::Unauthorized`] if `caller` is neither the primary
    ///   admin nor a co-admin.
    /// - [`EscrowError::NotFound`] if `escrow_id` does not exist.
    /// - [`EscrowError::AlreadyReleased`] if the escrow has been released.
    /// - [`EscrowError::AlreadyRefunded`] if the escrow has been refunded.
    /// - [`EscrowError::AlreadyCancelled`] if the escrow has been cancelled.
    pub fn clear_release_condition(
        env: Env,
        caller: Address,
        escrow_id: u64,
    ) -> Result<(), EscrowError> {
        caller.require_auth();
        if !Self::is_admin(env.clone(), caller) {
            return Err(EscrowError::Unauthorized);
        }
        let key = DataKey::Escrow(escrow_id);
        let record: EscrowRecord = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(EscrowError::NotFound)?;
        check_not_terminal(&record)?;
        env.storage()
            .persistent()
            .remove(&DataKey::ReleaseCondition(escrow_id));
        Ok(())
    }

    // ── Ticket 2: get_yield_config ────────────────────────────────────────────

    /// Read-only getter for the yield configuration of an escrow.
    ///
    /// Returns `None` when no yield config has been set via `set_yield_config`.
    /// Never mutates storage.
    pub fn get_yield_config(env: Env, escrow_id: u64) -> Option<YieldConfig> {
        env.storage()
            .persistent()
            .get(&DataKey::EscrowYieldConfig(escrow_id))
    }

    // ── Ticket 3: get_co_admins / get_pending_admin ───────────────────────────

    /// Read-only getter for the list of co-admins.
    ///
    /// Returns an empty `Vec` when no co-admins have been added — never
    /// panics on missing state. Never mutates storage.
    pub fn get_co_admins(env: Env) -> soroban_sdk::Vec<Address> {
        env.storage()
            .instance()
            .get(&DataKey::AdminList)
            .unwrap_or_else(|| soroban_sdk::Vec::new(&env))
    }

    /// Read-only getter for the pending (proposed) new primary admin.
    ///
    /// Returns `None` when no admin transfer is in progress. Never mutates
    /// storage.
    pub fn get_pending_admin(env: Env) -> Option<Address> {
        env.storage().instance().get(&DataKey::PendingAdmin)
    }

    // ── Ticket 4: get_admin ───────────────────────────────────────────────────

    /// Read-only getter for the current primary admin address.
    ///
    /// Panics when the contract has not been initialized — consistent with
    /// [`get_escrow`] and other "required value" getters in this contract that
    /// use `expect` rather than returning `Result`.
    pub fn get_admin(env: Env) -> Address {
        env.storage()
            .instance()
            .get(&DataKey::Admin)
            .expect("Admin not set")
    }
}

#[cfg(test)]
mod integration_tests;
#[cfg(test)]
mod test;
