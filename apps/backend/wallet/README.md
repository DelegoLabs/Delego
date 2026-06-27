# @delego/wallet

Delego **wallet** service.

## Development

```bash
pnpm --filter @delego/wallet dev
```

Health check: `GET http://localhost:3012/health`

## Environment

| Variable | Required | Purpose |
| --- | --- | --- |
| `STELLAR_NETWORK` | No (defaults to `testnet`) | Selects the public Stellar network. Allowed values: `testnet`, `mainnet`, `futurenet`. Unknown values are rejected at startup. |
| `STELLAR_PASSPHRASE` | No | Optional override for the network passphrase. Must either match `STELLAR_NETWORK` or be a custom value supplied together with explicit `STELLAR_HORIZON_URL` and `SOROBAN_RPC_URL`. Set-but-empty values are rejected at startup. |
| `STELLAR_HORIZON_URL` | No | Override the default Horizon URL for the configured network. |
| `SOROBAN_RPC_URL` | No | Override the default Soroban RPC URL for the configured network. |
| `WALLET_MASTER_SECRET` | Recommended in prod | Master secret used to encrypt the local vault. |

The wallet service validates its Stellar configuration during startup and
exits with code 1 on misconfiguration (unknown `STELLAR_NETWORK`, blank
`STELLAR_PASSPHRASE`, mismatched `STELLAR_NETWORK`/`STELLAR_PASSPHRASE`,
custom passphrase without explicit URLs). The selected network name and the
Soroban RPC URL are logged at startup; the passphrase itself is never
logged.
