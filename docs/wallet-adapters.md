# Wallet adapters

Every browser wallet Delego talks to goes through one seam: the
`StellarWalletAdapter` interface in `apps/frontend/lib/wallet/types.ts`. The
app never imports a wallet SDK directly — it resolves an adapter from the
registry and calls the interface. Freighter ships as the first adapter,
LOBSTR as the second.

```
useWallet (hooks/useWallet.ts)
   └── getWalletAdapter(id)  →  lib/wallet/registry.ts
          ├── freighterAdapter.ts   (window Freighter via @stellar/freighter-api)
          └── lobstrAdapter.ts      (LOBSTR signer extension, native postMessage)
```

## The interface

| Method | Contract |
| --- | --- |
| `detect()` | Is the extension installed? Never prompts. Drives the picker's connect-vs-install state. |
| `connect()` | Prompts for access, resolves with the public key. Throws `WalletAccessDeniedError` when the user declines, plain `Error` when the extension is missing. |
| `getAddress()` | Authorized public key, or `null` when installed but not authorized yet (the `disconnected` status). |
| `getNetwork()` | `{ network, networkPassphrase }`, or `null` when the wallet does not expose one. |
| `signTransaction(xdr)` | Signs an envelope and resolves with the signed envelope (FE-013). |
| `disconnect()` | Revokes whatever session the adapter holds. |
| `subscribe?(onChange)` | Optional account/network change listeners plus a cleanup. `useWallet` feature-detects it. |

Error mapping in `useWallet`: `WalletAccessDeniedError` → `error` status,
any other throw from `detect()`/`connect()` → `unavailable`.

## Selection and picker

- The chosen adapter id is persisted per browser under
  `delego_selected_wallet` (`lib/wallet/selection.ts`); unknown ids fall back
  to `DEFAULT_WALLET_ID` (`freighter`).
- `useWalletAdapters` probes every registered adapter once so the picker can
  show a connect action for installed wallets and an install link for the
  rest (`components/wallet/WalletPicker.tsx`, rendered inline on `/wallet`
  and inside the "Connect Wallet" dialog).
- The picker is presentational: it calls `onConnect(id)`, and the owning
  component runs `connect(id)` so connection state stays where it lives.

## Adding a third wallet

1. Create `apps/frontend/lib/wallet/<wallet>Adapter.ts` implementing
   `StellarWalletAdapter`. Keep SDK access inside that file (lazy-load if it
   only exists in the browser).
2. Register it in `walletAdapters` in `lib/wallet/registry.ts` — one line.
3. Add `lib/wallet/<wallet>Adapter.test.ts` covering `detect`, `connect`
   (success + declined), and `signTransaction`.

Nothing else changes: the hook, the picker, and the install links read the
registry. `pnpm --filter @delegolabs/web typecheck && npx vitest run` is the
verification.

## Notes

- No runtime dependency is added for LOBSTR: the signer extension's
  `window.postMessage` protocol is implemented in `lib/wallet/lobstrClient.ts`
  (the response echoes `messagedId`, the extension's own misspelling).
- LOBSTR's `getNetwork()` returns `null` — the signer API exposes no network,
  so `useNetworkMismatch` treats it as indeterminate instead of raising a
  false mismatch.
- `useWallet().signTransaction` is the entry point callers should use; it
  always delegates to the currently selected adapter.
