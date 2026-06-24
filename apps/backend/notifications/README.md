# @delego/notifications

Delego **notifications** service — email, push, and on-chain permission-event alerts.

## Development

```bash
pnpm --filter @delego/notifications dev
```

Health check: `GET http://localhost:3015/health`

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `NOTIFICATIONS_PORT` | No | `3015` | HTTP port for the service |
| `REDIS_URL` | No | `redis://localhost:6379` | Redis connection string for WebSocket pub/sub |
| `JWT_SECRET` | No | `change-me-in-production` | Secret used to verify WebSocket auth tokens |
| `SOROBAN_RPC_URL` | Yes (for listener) | — | Soroban RPC endpoint (e.g. `https://soroban-testnet.stellar.org`) |
| `PERMISSIONS_CONTRACT_ID` | Yes (for listener) | — | Soroban contract ID of the Permissions contract |
| `PERMISSION_LISTENER_POLL_MS` | No | `5000` | Polling interval in ms for the on-chain event listener |
| `USER_SERVICE_URL` | No | — | Base URL of the user service used to resolve wallet addresses to email addresses (e.g. `http://users:3020`). If not set, the owner wallet address is used as the email recipient. |
| `LOG_LEVEL` | No | `info` | Log level: `debug`, `info`, `warn`, `error` |

## Permission Event Listener

When `SOROBAN_RPC_URL` and `PERMISSIONS_CONTRACT_ID` are set, the service starts
`startPermissionEventListener` on boot. It polls the Soroban RPC for `permission_granted`,
`permission_updated`, and `permission_revoked` events emitted by the Permissions contract and
sends security-alert emails to the wallet owner.

The listener is **idempotent**: it tracks the highest ledger seen and only requests events
with a higher ledger on subsequent polls.
