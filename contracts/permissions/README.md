# Permissions Contract

On-chain spending controls for delegated AI agent authority.

## Merchant Restriction Getter

`get_merchant_restriction(owner, delegate)` exposes the merchant whitelist stored in
the existing `DataKey::Permission(owner, delegate)` record. The getter is read-only:
it does not mutate allowance counters, permission status, pending decrements, or
storage TTLs.

The current permission record stores merchants as a `Vec<Address>`. For wallet and
client flows that model a single merchant restriction, the getter returns the first
configured merchant as `Some(Address)`. It returns `None` when the permission entry
does not exist or when the permission is unrestricted with an empty merchant list.

<!-- TODO: Link to @delego/types PermissionGrant interface -->
