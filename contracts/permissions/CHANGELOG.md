# Permissions Contract Changelog

## [Unreleased]

### Added - Issue #101: Reject Permission Grants with Expired Ledger

#### Contract Error
- Added `PermissionError::ExpiryInPast` (error code 301) to reject permission grants that expire at or before the current ledger sequence.

#### Behavior Change
- The `grant` function now returns `Result<bool, PermissionError>` instead of `bool`
- Permission grants with `ttl_ledgers = 0` will now be rejected with `PermissionError::ExpiryInPast`
- The validation ensures that `current_ledger + ttl_ledgers > current_ledger`

#### API Impact
- **Breaking Change**: All callers of `grant()` must handle the Result type
- Use `.unwrap()`, `.is_ok()`, or `.try_grant()` depending on your error handling needs

#### Test Coverage
- `test_grant_with_zero_ttl_fails`: Verifies that zero TTL is rejected
- `test_grant_with_one_ledger_succeeds`: Verifies that TTL of 1 succeeds (boundary case)
- All existing tests updated to handle the new Result return type
