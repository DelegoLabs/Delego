# @delego/payments

Delego **payments** service.

## Features

### Dynamic Fee Estimation

Dynamically fetches transaction fees from Stellar Horizon based on current network congestion. Prevents transaction failures during periods of high network activity.

- **Smart Caching**: 30-second TTL reduces API load while keeping fees fresh
- **Automatic Fallback**: Uses safe minimum fees (100 stroops) when Horizon is unavailable
- **Network Aware**: Supports testnet, mainnet, and futurenet with intelligent defaults
- **Observable**: Logs fee source and estimates for monitoring

See [FEE_ESTIMATION.md](./escrow/FEE_ESTIMATION.md) for detailed documentation.

## Development

```bash
pnpm --filter @delego/payments dev
```

Health check: `GET http://localhost:3014/health`

## Testing

```bash
# Run tests once
pnpm --filter @delego/payments test

# Watch mode
pnpm --filter @delego/payments test:watch
```

## Environment Configuration

```bash
# Network selection (default: testnet)
STELLAR_NETWORK=testnet|mainnet|futurenet

# Horizon endpoint (optional, uses intelligent defaults)
STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org

# Wallet service endpoint
WALLET_URL=http://localhost:3012
```

## Architecture

- **escrow/**: Escrow contract interactions and fee management
  - `feeEstimator.ts`: Dynamic fee fetching from Horizon
  - `wallet-client.ts`: Wallet service integration
  - `FEE_ESTIMATION.md`: Comprehensive fee estimation guide
- **events/**: Event-driven payment workflows
- **settlement/**: Settlement and reconciliation logic
- **src/**: Core payment service logic
