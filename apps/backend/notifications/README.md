# @delego/notifications

Delego **notifications** service.

## Development

```bash
pnpm --filter @delego/notifications dev
```

Health check: `GET http://localhost:3015/health`

## Escrow Event Listener

The service runs a background listener that polls the Soroban RPC endpoint for escrow contract events.

### Environment Variables

The following environment variables configure the listener:

*   `SOROBAN_RPC_URL`: The URL of the Soroban RPC HTTP endpoint (e.g. `https://soroban-testnet.stellar.org`).
*   `ESCROW_CONTRACT_ID`: The Stellar address of the deployed escrow contract (`C...`).
*   `ESCROW_EVENT_POLL_INTERVAL_MS` (optional, default: `5000`): How frequently to poll the RPC for events, in milliseconds.
*   `ESCROW_EVENT_DEDUP_TTL_SECONDS` (optional, default: `86400` [24 hours]): The TTL of unique event records in Redis, used to prevent duplicate dispatch.
*   `REDIS_URL` (optional, default: `redis://localhost:6379`): Redis server URL used for event deduplication and Pub/Sub notifications.

