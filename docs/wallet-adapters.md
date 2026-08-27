# Wallet Adapters

Wallet connection in `@delegolabs/web` is driven by the `StellarWalletAdapter`
interface (`apps/frontend/lib/wallet/types.ts`). `useWallet` never talks to a
wallet SDK directly: it resolves an adapter from the registry and runs its
connection state machine through the interface. Freighter and LOBSTR ship as
the first two adapters.

## The interface

Every adapter implements:

| Member | Purpose |
|---|---|
| `id` | Stable identifier, persisted per browser as the user's wallet choice |
| `name` | Human-readable name for the picker and status copy |
| `installUrl` | Where "not installed" states link to |
| `detect()` | Whether the extension is present in this browser |
| `connect()` | Request access (may prompt); resolves to the address. Throws `WalletAccessDeniedError` when the user declines, so the hook can distinguish "denied" from "not installed" |
| `getAddress()` | Silent session resume; `null` when the wallet cannot report an address without prompting |
| `getNetwork()` | `null` fields mean the wallet cannot report its network |
| `signTransaction(xdr, opts?)` | Returns the signed XDR (consumed by FE-013 client-side Soroban signing) |
| `disconnect()` | Releases adapter-held state; the hook resets its own state regardless |

## Adding a wallet

1. Create one new file in `apps/frontend/lib/wallet/` implementing
   `StellarWalletAdapter` (see `lobstr.ts` for the minimal shape, or
   `freighter.ts` for a full-surface wallet).
2. Add it to the `walletAdapters` array in `lib/wallet/registry.ts`.

That is the entire integration: the picker lists it with detect/install
states, `useWallet` can drive it, and the selection persists under the
`delego_wallet_adapter` localStorage key automatically. Import the wallet's
SDK dynamically inside the adapter methods (both existing adapters do this)
so it never runs during SSR.

## Behavior notes

- **Selection persistence**: the chosen adapter id is stored per browser in
  `localStorage["delego_wallet_adapter"]` when a connection succeeds - a
  declined attempt never flips the stored choice. With nothing stored the
  hook defaults to Freighter, preserving the pre-adapter behavior exactly.
- **Fast paths**: a persisted choice that is still installed connects
  directly with no detection sweep, and when exactly one registered wallet
  is detected the button connects it directly - both match the old
  Freighter-only flow, and the golden-path e2e click sequence (Connect
  Wallet, then the address appears) is structurally unchanged. With zero or
  several wallets detected the picker opens with the sweep's results,
  showing install links for missing extensions; the unavailable state also
  renders a direct install link under the button.
- **LOBSTR limitations**: `@lobstrco/signer-extension-api` exposes only
  `isConnected`/`getPublicKey`/`signTransaction`/`signMessage`. There is no
  network query and no silent address read, so a persisted LOBSTR session
  resumes as "disconnected" until the user clicks connect again (LOBSTR
  keeps the approval for the browser session, so a reconnect in the same
  session does not re-prompt), and the network mismatch
  check takes its "cannot determine" path (`useNetworkMismatch` treats
  missing network info as non-blocking). Verify the intended network inside
  the LOBSTR app before signing.
- **Demo mode** (#632) short-circuits `useWallet` before any adapter code
  runs; adapters are never imported while it is active.
- **Detection timeouts**: `detectWalletAdapters()` caps each wallet's
  `detect()` handshake (800ms) so one unresponsive extension cannot stall
  the picker or the connect button. An installed extension answers
  immediately; the cap only trims the absent case, which LOBSTR otherwise
  answers after a 2s internal timeout.
