# @delego/notifications

Delego **notifications** service.

## Development

```bash
pnpm --filter @delego/notifications dev
```

Health check: `GET http://localhost:3015/health`

## Permission Event Listener (Issue #57)

The notifications service can subscribe to on-chain permission lifecycle
events from the Soroban permissions contract and dispatch owner-facing
security alerts (email + Web Push).  The listener is **opt-in** — it boots
only when both required environment variables are set.

### Required environment variables

| Variable                 | Default                 | Purpose                                                                      |
| ------------------------ | ----------------------- | ---------------------------------------------------------------------------- |
| `STELLAR_RPC_URL`        | _none_                  | Soroban RPC endpoint.  Falls back to `SOROBAN_RPC_URL` if both are unset. |
| `SOROBAN_RPC_URL`        | _none_                  | Alias for `STELLAR_RPC_URL` to match the wallet package's variable name.      |
| `PERMISSIONS_CONTRACT_ID`| _none_                  | The deployed permissions contract ID (e.g. `CABC…`).                          |

When either variable is missing the service boots normally and just logs
`Permission event listener disabled (set STELLAR_RPC_URL and …)`.

### Optional tuning

| Variable                              | Default | Purpose                                   |
| ------------------------------------- | ------- | ----------------------------------------- |
| `PERMISSION_EVENT_POLL_INTERVAL_MS`   | `5000`  | Polling cadence against `getEvents`.      |
| `PERMISSION_EVENT_START_LEDGER`       | `0`     | Fallback ledger when no Redis cursor is stored. |

### How it works

1. On boot the listener instantiates `rpc.Server(rpcUrl)` and starts polling
   the permissions contract for events with topic prefix `perm`.
2. Events are decoded from XDR into `PermissionContractEvent` records:
   - `("perm","granted")`  → `permission_granted`
   - `("perm","revoked")`  → `permission_revoked`
   - `("perm","spent")` / `("perm","paused")` / `("perm","resumed")`
     / `("perm","allowdec")` / `("perm","gpaused")` → `permission_updated`
3. The owner Stellar address is resolved to a `WalletNotificationTarget`
   via the existing `WalletLookupAdapter`.  Missing users are silently
   skipped — the listener never throws.
4. Notification payloads are dispatched idempotently using the existing
   `checkAndMarkDispatched` 24h NX key, so duplicate event deliveries never
   produce duplicate emails or pushes.
5. The polling cursor (`notifications:permissions:ledgerCursor`) is
   persisted in Redis so restarts resume from the last processed ledger.
   Combined with `InMemoryProcessedContractEventStore` dedup, replays of
   overlapping ranges are safe.

### Email templates

Three HTML templates live under `templates/`:

- `permission-granted.html`
- `permission-revoked.html`
- `permission-updated.html`

Each receives the keys `owner`, `delegate`, `eventType`, `limitStroops`,
`expiresAtLedger`, `contractId`, `txHash`.  When a field is missing from
the source event (e.g. `limitStroops` on a revoke) the literal string `—`
is substituted so every template renders coherently.

### Operational assumptions

- The shared Postgres instance exposes `wallets.stellar_address` and
  `users.email` via the `DbWalletLookupAdapter`.
- Push subscriptions live in Redis under the same `push:subscriptions:<userId>`
  key used by the rest of the notifications service.
- The RPC hard limit of 100 ledgers per `getEvents` request is respected by
  the listener, which advances the cursor by `processedLedger + 1` after
  each batch.
