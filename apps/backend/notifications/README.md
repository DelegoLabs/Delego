# @delego/notifications

Delego **notifications** service.

## Development

```bash
pnpm --filter @delego/notifications dev
```

Health check: `GET http://localhost:3015/health`

## Environment Variables

- `ESCROW_CONTRACT_ID`: The Soroban contract ID for the escrow contract, to listen for events.
- `SOROBAN_RPC_URL`: The Stellar RPC URL to poll for on-chain events.
- `REDIS_URL`: Redis connection URL, used for worker idempotency and deduplication.
- `DATABASE_URL`: PostgreSQL connection URL, used for wallet lookup adapter.
- `SENDGRID_API_KEY`: SendGrid API key for emails.
- `FROM_EMAIL`: Sender email address.
- `LOG_LEVEL`: Log level (e.g. info, debug).
