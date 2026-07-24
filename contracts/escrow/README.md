# Escrow Contract

Soroban smart contract for holding purchase funds until fulfillment.

## Functions

| Function | Auth required | Description |
|---|---|---|
| `initialize` | — | Set admin, fee config, and amount limits |
| `version` | — | Return contract name and semver |
| `create` | — | Create an unfunded escrow record in `Created` status |
| `fund` | buyer | Fund an existing `Created` escrow |
| `cancel` | seller (merchant) | Cancel an unfunded `Created` escrow |
| `deposit` | buyer | Lock buyer funds for an order (convenience `create` + `fund`) |
| `release` | buyer / admin | Transfer full remaining balance to seller |
| `partial_release` | buyer / admin | Transfer a partial amount to seller |
| `refund` | seller / admin / buyer (after timeout) | Return funds to buyer |
| `dispute` | buyer / seller | Mark escrow as disputed |
| `resolve_dispute` | admin | Resolve dispute, release to seller or refund buyer |
| `resolve_dispute_quorum` | any (after quorum) | Resolve via multi-arbiter quorum vote |
| `vote_dispute` | arbiter | Cast a quorum vote on a disputed escrow |
| `get_escrow` | — | Full `EscrowRecord` for an escrow id |
| `get_receipt` | — | Compact buyer-facing receipt |
| `get_merchant_receipt` | — | Seller-facing receipt with `release_eligible` flag |
| `get_release_eligibility` | — | Whether a release can proceed and why |
| `get_refund_eligibility` | — | Whether a caller can refund and why |
| `get_timeout_view` | — | Timeout metadata: ledger numbers and refundability |
| `get_escrow_metadata` | — | Optional off-chain order hash stored at deposit |
| `get_token` | — | Token address for an escrow |
| `get_fee_config` | — | Current fee config |
| `get_limits` | — | Current amount limits |
| `get_quorum_config` | — | Current arbiter quorum config |
| `get_dispute_votes` | — | Votes cast on a disputed escrow |
| `get_create_paused` | — | Whether new escrow creation is paused |
| `set_limits` | admin | Update amount limits |
| `set_quorum_config` | admin | Update arbiter list and threshold |
| `update_fee` | admin | Update fee basis points |
| `add_token` | admin | Whitelist a token for deposits |
| `remove_token` | admin | Remove a token from the whitelist |
| `list_tokens` | — | List all whitelisted tokens |
| `is_token_allowed` | — | Check if a token is whitelisted |
| `set_create_paused` | admin | Pause or unpause new escrow creation |
| `propose_admin` | primary admin | Start a two-step admin transfer |
| `accept_admin` | pending admin | Accept the admin role |
| `cancel_admin_transfer` | primary admin | Cancel a pending admin transfer |
| `add_co_admin` | primary admin | Add a co-admin |
| `remove_co_admin` | primary admin | Remove a co-admin |
| `is_admin` | — | Check if an address is admin or co-admin |

## `get_timeout_view` (issue #88)

Read-only getter that returns timeout metadata for a single escrow without
mutating any contract state. Safe to call from off-chain indexers and backend
services without auth.

```rust
pub fn get_timeout_view(env: Env, escrow_id: u64) -> Result<EscrowTimeoutView, EscrowError>
```

### `EscrowTimeoutView`

```rust
pub struct EscrowTimeoutView {
    pub escrow_id: BytesN<32>,   // 32-byte order id (same key as other receipts)
    pub timeout_ledger: u32,     // ledger sequence when buyer-refund timeout expires
    pub current_ledger: u32,     // ledger sequence at call time
    pub refundable: bool,        // true only when Funded AND current_ledger >= timeout_ledger
}
```

`refundable` is `true` only when the escrow is still in `Funded` status **and**
`current_ledger >= timeout_ledger`. Terminal states (`Released`, `Refunded`) and
`Disputed` always return `refundable: false`.

### Errors

| Code | Meaning |
|---|---|
| `EscrowError::NotFound` (2) | No escrow exists for the given `escrow_id` |

### No new storage keys or environment variables

`get_timeout_view` reads `DataKey::Escrow(escrow_id)` (existing persistent
storage) and `env.ledger().sequence()`. No new keys, migrations, or environment
variables are required.

## Merchant Cancellation

Merchants (sellers) may cancel an escrow that has been created but not yet funded (`status == Created`).
Cancellation transitions the escrow to `EscrowStatus::Cancelled` (a terminal state) and emits `EscrowCancelledEvent`.

```rust
pub fn cancel(env: Env, escrow_id: u64, caller: Address, reason: Symbol) -> Result<bool, EscrowError>
```

### `EscrowCancelledEvent`

```rust
pub struct EscrowCancelledEvent {
    pub escrow_id: BytesN<32>,   // 32-byte order id
    pub cancelled_by: Address,   // merchant address
    pub reason: Symbol,         // short cancellation reason symbol
}
```

### Errors

| Code | Meaning |
|---|---|
| `EscrowError::AlreadyFunded` (28) | Cannot cancel an escrow after funds are locked |
| `EscrowError::AlreadyCancelled` (27) | Escrow has already been cancelled |
| `EscrowError::Unauthorized` (3) | Caller is not the merchant (`seller`) |

## Events

| Topic tuple | Payload struct | Emitted by |
|---|---|---|
| `("escrow", "created")` | `EscrowCreatedEvent` | `create` / `deposit` |
| `("escrow", "metadata")` | `EscrowMetadataEvent` | `create` / `deposit` (when metadata supplied) |
| `("escrow", "cancelled")` | `EscrowCancelledEvent` | `cancel` |
| `("escrow", "released")` | `EscrowReleasedEvent` | `partial_release` / `release` |
| `("escrow", "refunded")` | `EscrowRefundedEvent` | `refund` |
| `("escrow", "disputed")` | `EscrowDisputedEvent` | `dispute` |
| `("escrow", "resolved")` | `EscrowResolvedEvent` | `resolve_dispute` / `resolve_dispute_quorum` |
| `("escrow", "paused")` | `EscrowPauseChangedEvent` | `set_create_paused` |
| `("admin", "proposed")` | `AdminProposedEvent` | `propose_admin` |
| `("admin", "accepted")` | `AdminAcceptedEvent` | `accept_admin` |
| `("admin", "cancelled")` | `AdminTransferCancelledEvent` | `cancel_admin_transfer` |

## Development

```bash
cd contracts/escrow

# Run all tests
cargo test

# Build WASM for deployment
cargo build --target wasm32-unknown-unknown --release
```
