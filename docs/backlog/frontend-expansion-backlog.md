# Frontend Expansion Backlog (50 Issues)

Detailed, self-contained issues sized at **1–3 developer-days each** (~87 dev-days total).

**Scope:** `apps/frontend` (Next.js 15 App Router) and `packages/ui` (`@delegolabs/ui`) in this repository.

**Import:** run `GITHUB_TOKEN=<token> python3 scripts/import_issues.py` (add `--dry-run` to preview). The importer skips any issue whose title already exists, and creates all labels.

**Prior-art convention:** several items extend work already shipped under the earlier `[Frontend]` wave (#291–#316) and later PRs (#473–#493). Each issue cites that context so implementers do not re-do finished work.

## Summary

| Group | Issues | Dev-days |
|---|---|---|
| A. Data layer & resilience | #508 – #514 | 11 |
| B. Wallet & Stellar | #515 – #522 | 15 |
| C. Delegation management | #523 – #528 | 11 |
| D. Approvals | #529 – #533 | 8 |
| E. Orders & escrow | #534 – #538 | 7 |
| F. Design system & UI | #539 – #545 | 13 |
| G. Settings & personalization | #546 – #548 | 5 |
| H. Analytics | #549 – #550 | 3 |
| I. Testing & CI | #551 – #555 | 10 |
| J. A11y, i18n & docs | #556 – #557 | 4 |

---

## A. Data Layer & Resilience

### Cursor pagination and infinite scroll for delegation and order lists
labels: area/data-layer
estimate: 2 days

**Context:** List pages (`app/delegations`, `app/orders`) currently render whatever payload the SDK returns in one shot. Gateway-side pagination helpers exist ([Gateway] Add Pagination Parser for List Endpoints, #112) and the transaction-history page already does filtered pagination (#298), but delegation/order lists do not paginate.

**Tasks:**
- [ ] Extend the SDK call sites in `hooks/useDelegations.ts` and `hooks/useOrders.ts` to accept `cursor` / `limit` params and return a page token
- [ ] Add an `useInfiniteQuery`-style hook (or equivalent manual accumulator) with an `IntersectionObserver` sentinel component
- [ ] Provide a "Load more" button fallback for keyboard/no-scroll cases, plus end-of-list and empty-result states
- [ ] Reset accumulated pages when active filters change

**Acceptance criteria:**
- [ ] Lists fetch pages of 20; scrolling near the bottom loads the next page without duplicates
- [ ] Filter changes reset the list cleanly (no stale rows appended)
- [ ] Unit tests cover cursor accumulation and reset behavior

---

### Idempotent request retries with jittered backoff and 429 handling
labels: area/data-layer
estimate: 1 day

**Context:** `lib/api.ts` wraps `DelegoClient` with a 401 redirect, but transient failures (network blips, 5xx, rate limits) surface directly to the user. Backend services already classify retries internally ([Wallet] Transaction Submission Retry Classification, #196); the frontend client needs the mirror-image behavior.

**Tasks:**
- [ ] Add a retry wrapper around safe/idempotent GET requests in `lib/api.ts`: up to 3 attempts, exponential backoff with jitter
- [ ] Never retry 4xx except `429`; honor `Retry-After` headers when present
- [ ] When a 429 persists, show a friendly "Too many requests — retrying in Xs" state instead of raw errors
- [ ] Make attempts/backoff configurable per call for future tuning

**Acceptance criteria:**
- [ ] Unit tests with fake timers verify attempt counts, backoff growth, and no-retry on 400/403/404
- [ ] Existing 401 redirect behavior is unaffected

---

### URL-synced filter state and shareable saved views
labels: area/data-layer
estimate: 2 days

**Context:** Global search/filter across entities shipped (#312, extended by PR #485), but filter state lives in component memory — refreshing loses it and views cannot be shared or bookmarked.

**Tasks:**
- [ ] Create a `useQueryParamState` hook (stringified JSON or individual params) that syncs filters to the URL query string via the App Router
- [ ] Apply it to delegations, orders, escrows, and approvals list pages
- [ ] Back/forward navigation preserves filter history; invalid params fall back to defaults silently
- [ ] Optional: "Copy link to this view" affordance per page

**Acceptance criteria:**
- [ ] Refreshing a filtered URL restores the exact view
- [ ] Sharing a link renders identical results for another session
- [ ] No hydration mismatches (params read client-side after mount)

---

### Sentry error tracking with source maps and release tagging
labels: area/data-layer
estimate: 2 days

**Context:** Backend services adopted Sentry (#458); the web app has global error UI (#302, PR #475) but no aggregation, so production JS errors are invisible.

**Tasks:**
- [ ] Install `@sentry/nextjs`; wire client, server, and edge configs
- [ ] Upload source maps during CI builds; tag events with git SHA release
- [ ] Scrub auth tokens/localStorage from payloads before send; set sensible sample rates via env
- [ ] Add breadcrumb context (current route, network id, connected wallet presence — never the address itself unless opted in)

**Acceptance criteria:**
- [ ] Throwing in a dev preview reports to the configured Sentry project with readable stacks
- [ ] `.env.example` documents `NEXT_PUBLIC_SENTRY_DSN` and related vars
- [ ] No PII (keys, tokens) appears in a sampled event

---

### Web Vitals instrumentation with a documented performance budget
labels: area/perf-a11y
estimate: 1 day

**Context:** Build-time bundle analysis exists (#402, PR #483) but there is no runtime measurement of what users actually experience.

**Tasks:**
- [ ] Report LCP/CLS/INP/FCP/TTFB via `next/web-vitals` to the analytics endpoint or Sentry (reuse #511 transport when present)
- [ ] Document a performance budget in `docs/architecture/frontend-perf.md` (e.g., initial route JS < 200KB gz, LCP < 2.5s on mid-tier mobile)
- [ ] Add an npm script that fails locally if the budget is exceeded using the existing analyzer output

**Acceptance criteria:**
- [ ] Vitals visible in devtools console in dev mode and delivered in prod builds
- [ ] Budget doc reviewed and linked from the README

---

### Lightweight feature flag system
labels: area/data-layer
estimate: 1 day

**Context:** Mainnet rollout will require dark-launching features (e.g., client-side signing #520). There is no flag mechanism today.

**Tasks:**
- [ ] `FeatureFlagProvider` reading static flags from validated env vars (`NEXT_PUBLIC_FEATURE_*`) with a typed registry in `lib/featureFlags.ts`
- [ ] `useFeatureFlag(name)` hook and a `<IfFeature name>` wrapper component
- [ ] Document the process for adding/retiring a flag; default-deny for unknown names in prod

**Acceptance criteria:**
- [ ] Flags are tree-shakeable/statically analyzable; no runtime fetch required for v1
- [ ] Unit tests cover enabled/disabled/unknown paths

---

### Idle session timeout warning and graceful re-auth
labels: area/settings
estimate: 2 days

**Context:** Auth token storage/injection and protected-route middleware shipped (#405, #406), but an expired session mid-task hard-redirects to `/login` (see `onUnauthorized` in `lib/api.ts`), losing in-progress form state such as a half-completed delegation.

**Tasks:**
- [ ] Track user activity (pointer/key events, throttled); after N minutes idle, show a "Still there?" modal with countdown
- [ ] On confirm, ping a cheap authenticated endpoint to refresh; on failure, route to `/login` with a `?next=` param
- [ ] Preserve wizard/form drafts across the redirect (localStorage draft keyed by route, restored on return)
- [ ] Configurable timeout via env; disabled in dev by default

**Acceptance criteria:**
- [ ] Active users never see the modal; idle users get warned before expiry
- [ ] Returning from login lands on the original page with draft restored
- [ ] Tests simulate expiry using fake timers

---

## B. Wallet & Stellar

### Subscribe to Freighter account/network change events
labels: area/wallet
estimate: 1 day

**Context:** `hooks/useWallet.ts` takes a one-shot snapshot on mount and on manual connect; if the user switches accounts inside the extension, the app keeps operating against a stale address until reload.

**Tasks:**
- [ ] Register `freighter.onAccountChange` / `onNetworkChange` listeners (dynamically imported like the rest of the module) inside `useWallet`
- [ ] Re-run the refresh flow on events; clean up listeners on unmount
- [ ] Surface a subtle toast when the active address changes mid-session ("Switched to GABC…XYZ")

**Acceptance criteria:**
- [ ] Switching accounts in Freighter updates header/wallet UI within ~1s without reload
- [ ] Network changes trigger the mismatch guard (#518) rather than silent breakage
- [ ] No listener leaks (tests assert cleanup)

---

### Wallet adapter abstraction + LOBSTR extension support
labels: area/wallet
estimate: 3 days

**Context:** Connection is hard-wired to Freighter (#292). LOBSTR ships a browser extension with a similar API surface; users outside Freighter's audience are locked out.

**Tasks:**
- [ ] Define a `StellarWalletAdapter` interface: `id`, `name`, `detect()`, `connect()`, `getAddress()`, `getNetwork()`, `signTransaction(xdr)`, `disconnect()` (sign used by #520)
- [ ] Refactor `useWallet` to consume adapters; Freighter becomes the first adapter (behavior unchanged)
- [ ] Implement a LOBSTR adapter behind the same interface
- [ ] Wallet picker UI on the wallet page/connect entry point listing detected adapters, with "not installed → install link" states

**Acceptance criteria:**
- [ ] Connecting via either extension works on testnet; selection persisted per browser
- [ ] Existing Freighter flows show no regression (manual pass + unit tests)
- [ ] Adding a third adapter requires only a new file implementing the interface (documented)

---

### WalletConnect support for mobile Stellar wallets
labels: area/wallet
estimate: 3 days

**Context:** Mobile users cannot connect at all today. Stellar WalletConnectKit-style flows let phones act as signers for the desktop session. Depends on the adapter interface from #516.

**Tasks:**
- [ ] Add a WalletConnect-based adapter (e.g., via `@stellarwalletsconnect`-style SDK or Freighters' WC bridge — pick and document the maintained lib)
- [ ] Pairing UX: QR code (reuse the lazy-loaded QR lib pattern noted in `useWallet`) + deep-link button on mobile
- [ ] Session persistence and reconnection; disconnect clears pairing state
- [ ] Sign requests route through the same `signTransaction` contract used by #520

**Acceptance criteria:**
- [ ] A mobile wallet (e.g., Lobstr Prime/X Bull — whichever the chosen lib supports) can connect on testnet and sign a sample tx from desktop
- [ ] Stale/expired sessions degrade gracefully with a clear reconnect path

---

### Guard against wallet↔app network mismatch
labels: area/wallet
estimate: 1 day

**Context:** The network toggle stores its own choice (#306; `lib/networks.ts` + `NetworkProvider`). `useWallet` separately reads Freighter's network. Nothing reconciles them — a wallet on PUBLIC while the app targets testnet produces confusing failures at signing time.

**Tasks:**
- [ ] Compare `state.networkPassphrase` from `useWallet` against the active `NetworkConfig` in a `useEffect`
- [ ] On mismatch render a blocking modal: "Your wallet is on Mainnet but the app is on Testnet" with two actions — switch app network / instructions to switch the extension
- [ ] Suppress transactable CTAs while mismatched (approvals, releases, delegation create)

**Acceptance criteria:**
- [ ] Mismatch is impossible to miss and impossible to transact through
- [ ] Resolving either side dismisses the modal without reload loops
- [ ] Unit tests cover match/testnet-vs-mainnet permutations

---

### Mainnet safety guards (confirm-to-switch, live badge, tx confirmation)
labels: area/wallet
estimate: 1 day

**Context:** `NETWORKS.mainnet.isLive` exists in `lib/networks.ts` but nothing consumes it aggressively. Moving to mainnet readiness means protecting users from accidental live-network actions.

**Tasks:**
- [ ] Confirmation dialog before toggling the app to mainnet ("real funds" copy), remembered choice optional
- [ ] Persistent `LIVE` badge treatment wherever the network indicator renders when `isLive`
- [ ] Extra confirmation step before any transaction submission while on mainnet (signing flows from #520 plug into this)

**Acceptance criteria:**
- [ ] Switching to mainnet always requires deliberate confirmation (fresh sessions)
- [ ] All submit-type actions on mainnet double-confirm; testnet unaffected
- [ ] Snapshot/unit tests cover both network modes

---

### Client-side Soroban signing for escrow release and approval confirmations
labels: area/wallet
estimate: 3 days

**Context:** Trust-minimized operations are a core vision principle (`docs/vision.md`), yet release/approve actions round-trip through the gateway's wallet keys today. With contracts exposing getters/views (#90, #474 and the permissions suite #98–#108), the frontend can construct and sign invocations locally.

**Tasks:**
- [ ] Coordinate with `DelegoLabs/Delego-contracts` for exact method signatures/types; generate or hand-write typed invocation helpers using `@stellar/stellar-sdk` contract clients
- [ ] Implement `signAndSubmit` via the wallet adapter `signTransaction` (#516), submitting through the configured `sorobanRpcUrl`
- [ ] TX lifecycle UI: building → awaiting signature → submitting → confirmed/failed, with hash + explorer link on completion
- [ ] Wire the escrow release button and high-value approval confirmation (#297 flow) to the local-signing path behind a feature flag (#513); gateway path remains fallback
- [ ] Handle wallet rejection, insufficient fee bump, and RPC timeouts with actionable errors

**Acceptance criteria:**
- [ ] On testnet demo escrow, a user releases funds signed by their own Freighter key end-to-end
- [ ] Failure at any stage leaves on-chain state consistent and surfaces a clear message
- [ ] Flag-off behavior identical to today

---

### Balance history sparkline and asset breakdown on the wallet page
labels: area/wallet
estimate: 2 days

**Context:** Current balances render on the wallet page (#300). There is no historical view, and issued-asset balances beyond XLM are easy to miss.

**Tasks:**
- [ ] Fetch recent balance checkpoints via Horizon (account effects/trades or a gateway endpoint if cheaper) for a 30-day series
- [ ] Render an inline sparkline (dependency-light SVG, no chart lib yet — #549 introduces the heavier stack)
- [ ] Asset breakdown table: code, balance, issuer domain (via TOML lookup cached), explorer links
- [ ] Unfunded/new accounts show an inviting zero state linking to #522's faucet

**Acceptance criteria:**
- [ ] Sparkline matches fetched series; graceful empty state when Horizon lacks history
- [ ] Asset rows deep-link to the issuing asset on the correct explorer per network

---

### Testnet Friendbot faucet helper
labels: area/wallet, good first issue
estimate: 1 day

**Context:** New testnet accounts start unfunded and every downstream demo blocks. Friendbot is free but requires leaving the app.

**Tasks:**
- [ ] On testnet only, when connected account balance is 0, show a "Fund your account" card calling `friendbot.stellar.org` with the address
- [ ] Disable while pending; success toast with new balance; friendly error on Friendbot rate limiting
- [ ] Hide entirely on mainnet (guard on `isLive`)

**Acceptance criteria:**
- [ ] Fresh account goes from unfunded to usable without leaving the app
- [ ] Repeated clicks are debounced; mainnet never renders the card

---

## C. Delegation Management

### Guided multi-step delegation creation wizard
labels: area/delegations
estimate: 3 days

**Context:** Delegations CRUD shipped (#293, PR #482) with a single-form create. Delegation is the platform's core concept — scoping agent authority deserves a stepped, reviewable flow (vision doc: user sovereignty + programmable trust).

**Tasks:**
- [ ] Build a reusable `Stepper` primitive (packages/ui) with completed/current/upcoming states
- [ ] Wizard steps: ① choose agent (paste ID / scan QR reusing #314's component) → ② scope (allowed task categories + merchant restrictions feeding #524) → ③ limits (embed #525 amount editor, approval threshold, expiry #526/020 inputs) → ④ review & confirm with plain-language summary ("Nova can spend up to 50 XLM weekly on groceries until Sep 1")
- [ ] Persist an editable draft to localStorage; resuming restores step position
- [ ] Cancel asks for confirmation once any field is dirty

**Acceptance criteria:**
- [ ] Created delegation matches the review summary exactly (assert against API payload in tests)
- [ ] Draft survives refresh and navigation away/back
- [ ] Fully operable by keyboard; steps validate independently

---

### Merchant whitelist picker for delegation scope
labels: area/delegations
estimate: 2 days

**Context:** The Permissions contract supports bounded merchant whitelists (#61, #104, #370) but the frontend exposes no way to configure one — delegations are all-or-nothing by merchant today.

**Tasks:**
- [ ] Whitelist editor inside the wizard scope step and on delegation edit: searchable merchant list (from the gateway directory endpoint) with add/remove chips
- [ ] "Allow all merchants" default toggle; when off, require ≥1 selected
- [ ] Show effective whitelist read-only on the delegation detail page

**Acceptance criteria:**
- [ ] Grant payload carries the merchant restriction list and the contract accepts it on testnet
- [ ] Removing the last merchant while unrestricted=off blocks submission with inline guidance

---

### Delegation limit usage / burn-down visualization
labels: area/delegations
estimate: 2 days

**Context:** Spending policy configuration exists (#296) and last-spend ledger fields landed on-chain (#106, #153), but users see static numbers — not how much headroom remains this period.

**Tasks:**
- [ ] `LimitUsageBar` component: spent vs. cap for the current period with period rollover timestamp
- [ ] Color thresholds (<70% calm, 70–90% amber, >90% red) respecting dark mode tokens (#310)
- [ ] Place on delegation cards (compact) and detail page (expanded with ledger entries from the spend history getters #37/#227)
- [ ] Near-limit state suggests enabling/tightening the approval threshold

**Acceptance criteria:**
- [ ] Numbers reconcile with on-chain ledger values shown elsewhere
- [ ] Period boundary math has unit tests incl. timezone edges

---

### Clone/duplicate delegation action
labels: area/delegations
estimate: 1 day

**Context:** Recurring grocery/subscriptions (top vision use case) mean users recreate near-identical delegations repeatedly.

**Tasks:**
- [ ] "Duplicate" action on delegation rows/detail: opens the wizard (#523) pre-filled from the source, requiring fresh review before submit
- [ ] Copy excludes volatile fields (remaining spends, ledger state) and forces expiry re-entry if the source expired

**Acceptance criteria:**
- [ ] Cloned delegation creation is ≤2 clicks from an existing row
- [ ] Expired-source clones cannot inherit past dates

---

### Delegation detail: unified tabs for orders, escrows, and activity log
labels: area/delegations
estimate: 2 days

**Context:** The delegation page (#293) lists delegations; per-delegation drilldown scatters related records. Orders and escrows each carry their own timelines (#295, #307).

**Tasks:**
- [ ] Route `/delegations/[id]`: overview header (status, limits via #525, expiry countdown reusing #473's component) + tabbed sections: Activity | Orders | Escrows
- [ ] Activity tab renders the shared event timeline (consume #534's component) fed by delegation-scoped events
- [ ] Orders/Escrows tabs embed the existing lists filtered to this delegation, with links to full pages

**Acceptance criteria:**
- [ ] Deep link loads directly (unknown id → styled not-found)
- [ ] Tab state reflects in URL hash/query for shareability

---

### Pause / resume delegation controls
labels: area/delegations
estimate: 1 day

**Context:** Grant pause/resume exists on-chain and in services (#35, #186, #233) with no consumer UI — users must revoke to stop an agent temporarily.

**Tasks:**
- [ ] Pause/Resume toggle on delegation detail and row overflow menu, with confirm modal explaining paused semantics (no new spends; pending approvals stay decidable)
- [ ] Paused visual state (badge + dimmed card) across lists
- [ ] Optimistic update with rollback on API failure

**Acceptance criteria:**
- [ ] Paused delegation blocks new agent-initiated orders end-to-end on testnet
- [ ] State persists correctly across refresh and network switches

---

## D. Approvals

### Bulk approve/reject with per-item result report
labels: area/approvals
estimate: 2 days

**Context:** The approval workflow UI (#297) handles one request at a time; a busy delegate queue makes one-by-one painful.

**Tasks:**
- [ ] Row checkboxes + select-all (page-scoped), sticky action bar showing count and Approve/Reject buttons
- [ ] Sequential-with-concurrency (≤3) execution; disable inputs mid-run; progress indicator
- [ ] Completion summary: succeeded list, failed list with reasons, "retry failed" action
- [ ] Respect per-item threshold rules — items exceeding the user's own confirm limit are excluded from bulk and flagged

**Acceptance criteria:**
- [ ] Mixed success/failure never leaves ambiguous row states
- [ ] Keyboard accessible (space to toggle, enter to act)
- [ ] Unit tests cover concurrency batching and partial failure

---

### Approval detail drawer with agent explainability panel
labels: area/approvals
estimate: 2 days

**Context:** Vision doc requires agent explainability; approval rows (#297) show summaries but not *why* the agent chose an item/price. Orchestrator workflow events (#130, #206) provide the underlying trail.

**Tasks:**
- [ ] Right-side drawer opening from approval rows: item imagery, price vs. typical-range hint (when the payload provides it), agent reasoning text, decision evidence links (source URLs, comparable offers), delegation context (remaining limit)
- [ ] Approve/Reject footer with the same guarantees as inline actions (optimistic, rollback)
- [ ] Focus-trapped, Esc-closable, aria-modal — coordinate with the Modal primitive from #540

**Acceptance criteria:**
- [ ] Drawer content maps every field available in the approval payload; missing optional sections collapse cleanly
- [ ] Screen-reader announced on open; focus returns to invoking row on close

---

### Keyboard-first approval triage (hotkeys + undo)
labels: area/approvals
estimate: 1 day

**Context:** Power approvers (business procurement persona in the vision doc) live on the keyboard; the inbox is mouse-driven today.

**Tasks:**
- [ ] Hotkeys on the approvals list: `j/k` navigate, `a` approve focused row, `r` reject, `Enter` open drawer (#530), `?` shows cheat-sheet overlay
- [ ] Undo snackbar (5s window) after acting on the focused row — reverses via the complementary API call where supported, otherwise re-opens the item flagged
- [ ] Visible focus ring follows the roving cursor; hotkeys disabled while typing in inputs

**Acceptance criteria:**
- [ ] Full triage achievable hands-on-keys from load to empty queue
- [ ] Cheat sheet discoverable; no hotkey conflicts with browser defaults (avoid ⌘/Ctrl combos)

---

### Browser notifications for pending approvals
labels: area/approvals
estimate: 2 days

**Context:** In-app notification center works (#304, PR #488); native OS notifications would alert users whose tab is backgrounded — critical since approvals gate agent spending.

**Tasks:**
- [ ] Permission-request UX: opt-in prompt from settings and contextually after first delegation (never on page load)
- [ ] When a new approval arrives (reuse the realtime channel from #316/#489 or polling fallback) and `document.hidden`, fire a Notification with title/amount/deep link
- [ ] Clicking focuses the app and opens the approval drawer; dedupe so one request yields one notification
- [ ] Settings kill-switch; auto-suppress when focus returns

**Acceptance criteria:**
- [ ] Background-tab approval produces exactly one clickable OS notification
- [ ] Denied permission degrades to in-app-only with no repeated prompting

---

### Aging/SLA indicators on pending approvals
labels: area/approvals
estimate: 1 day

**Context:** Pending approvals stall agent workflows silently; users lack urgency signals.

**Tasks:**
- [ ] Age badge per pending row ("2h", "3d") computed from createdAt, refreshing live
- [ ] Threshold styling: amber after configurable SLA (default 12h), red after 48h; sort option "oldest first"
- [ ] Digest hint in the notification center: "N approvals waiting > 24h"

**Acceptance criteria:**
- [ ] Timestamp math handles timezone/clock skew sanely (UTC storage, local render — tested)
- [ ] Thresholds configurable via constants file; documented

---

## E. Orders & Escrow

### Shared event-sourced activity timeline component
labels: area/orders-escrow, area/design-system
estimate: 2 days

**Context:** Order tracking (#295/#489) and escrow dashboards (#307, #471) each render bespoke step lists; delegation activity (#527) needs a third variant. One parameterized component kills the duplication going forward.

**Tasks:**
- [ ] `ActivityTimeline` in packages/ui: accepts normalized events `{id, type, title, description, timestamp, icon?, tone?}`; renders vertical stepper with relative time + absolute tooltip
- [ ] Tone variants for success/pending/failed/refunded mapping escrow states (#96's enum) and order statuses
- [ ] Migrate the order tracking page to it (visual parity check), leave escrow dashboard migration as follow-up
- [ ] Storybook story (lands with #539 or standalone story file ready for it)

**Acceptance criteria:**
- [ ] Order page renders identically-or-better vs. current implementation (side-by-side screenshot in PR)
- [ ] Component unit-tested: ordering, tone mapping, empty state
- [ ] Types exported from `@delegolabs/ui`

---

### Dispute initiation and tracking UI
labels: area/orders-escrow
estimate: 2 days

**Context:** Contracts emit disputed-state events (#89) and arbiters exist, but buyers have no in-app path to start or follow a dispute.

**Tasks:**
- [ ] "Open dispute" CTA on active/fulfilled escrows → modal with reason select (item not received / not as described / other) + description + optional evidence URLs
- [ ] Submit via payments API; optimistic `DISPUTED` chip on escrow cards/timeline (#534 tone)
- [ ] Disputed escrow detail shows arbiter/status fields exposed by the contract getters (#94 admin/arbiter getter) and links any resolution events
- [ ] Guard rails: one open dispute per escrow; terminal states hide the CTA

**Acceptance criteria:**
- [ ] End-to-end on testnet: open dispute → status reflected in UI without reload after event arrival
- [ ] Validation prevents empty reasons; API errors surface inline

---

### Order receipt view with print/export
labels: area/orders-escrow
estimate: 1 day

**Context:** Buyer-facing receipts don't exist; merchant receipt getters landed contract-side (#170, #270). Users need proof-of-purchase for expense reporting (business persona).

**Tasks:**
- [ ] Receipt panel on order detail: line items, fees, escrow id, timestamps, totals in XLM with fiat estimate honoring #546 preference
- [ ] `@media print` stylesheet producing a clean A4/Letter sheet (hide chrome/nav)
- [ ] "Download JSON" of the raw order record for bookkeeping integrations

**Acceptance criteria:**
- [ ] Browser print preview is clean on Chrome/Firefox
- [ ] Totals match the order record exactly (unit-test the formatter)

---

### CSV export for orders and spending history
labels: area/orders-escrow
estimate: 1 day

**Context:** Finance-minded users (procurement use case) want spreadsheet exports; everything needed is already rendered in lists.

**Tasks:**
- [ ] Export button on orders list and analytics page respecting active filters/date range
- [ ] Client-side CSV generation (no new deps): stable column schema (id, date, amount_xlm, amount_fiat, delegation_id, agent_id, status, escrow_id)
- [ ] Escape/quote correctly; filename convention `delego-orders-YYYYMMDD.csv`

**Acceptance criteria:**
- [ ] Opens cleanly in Excel/Sheets incl. commas-in-notes edge cases (tested)
- [ ] Export of 0 rows still downloads a header-only file with a toast notice

---

### Contract transparency panel
labels: area/orders-escrow
estimate: 1 day

**Context:** Trust-minimized claims deserve verifiable surfaces: users should see exactly which deployed contract versions hold their funds. Contracts expose version getters (#97, #103).

**Tasks:**
- [ ] Settings → "Network & contracts": per active network, list escrow / permissions / registry contract IDs (from env/config), deployed versions fetched live, and explorer links
- [ ] Warning banner if a configured address fails validation (checksum/format) 
- [ ] Link from escrow detail ("View contract") straight to the right explorer entry

**Acceptance criteria:**
- [ ] Addresses sourced from config only — never hardcoded literals in components
- [ ] Testnet/mainnet lists independent and correct after switching (#306)

---

## F. Design System & UI

### Storybook for @delegolabs/ui with CI artifact
labels: area/design-system, area/testing
estimate: 2 days

**Context:** `packages/ui` (Button, Card, FormField, StroopsInput) has unit tests but no visual workshop; consumers develop blind.

**Tasks:**
- [ ] Storybook 8 (Vite builder) scoped to packages/ui with TS path aliases resolved
- [ ] Stories for all four components with controls (variant/size/disabled/error states) + autodocs
- [ ] Interaction stories: FormField validation trigger, StroopsInput formatting
- [ ] `pnpm --filter @delegolabs/ui storybook` / `build-storybook`; CI job uploads the static build as an artifact and posts its path on PRs

**Acceptance criteria:**
- [ ] Zero impact on app build (isolated config); root `pnpm build` unaffected
- [ ] Every exported component has ≥1 story

---

### Missing primitives: Modal, Tabs, Badge, Tooltip
labels: area/design-system
estimate: 3 days

**Context:** The ui package covers buttons/cards/forms; overlays and tabular navigation are improvised per page (drawer/modal patterns would be duplicated by #530, #514, #535 without this).

**Tasks:**
- [ ] `Modal`: portal render, focus trap, restore-focus-on-close, Esc + backdrop close, sizes; built on `<dialog>` semantics or Radix-free minimal implementation (no new runtime dep without discussion)
- [ ] `Tabs`: roving tabindex keyboard model, controlled/uncontrolled
- [ ] `Badge`: tones (neutral/success/warn/danger/live) consumed by escrow chips & network badges
- [ ] `Tooltip`: hover/focus, delay, safe positioning; respects reduced motion
- [ ] Tests per component (render/interaction/a11y basics) mirroring existing suites

**Acceptance criteria:**
- [ ] axe-clean on default states; keyboard-complete
- [ ] At least one real consumption each (Modal→#530 or #535, Tabs→#527, Badge→escrow status, Tooltip→limits bar)

---

### App-wide toast system
labels: area/design-system
estimate: 2 days

**Context:** Feedback today is ad-hoc per page (alerts/inline). Mutation-heavy flows (bulk approvals, signing) need a uniform async-feedback channel distinct from the persistent notification center (#304).

**Tasks:**
- [ ] `ToastProvider` + `useToast()` in the app (ui-package presentation component, app-level state): variants info/success/warn/error, auto-dismiss timers, max-3 stacking, action-button slot (Undo in #531)
- [ ] Pause timers on hover/focus; aria-live polite region; exit animations gated on prefers-reduced-motion (#403)
- [ ] Replace existing ad-hoc success/error notices across mutation call sites

**Acceptance criteria:**
- [ ] Single source of truth for transient feedback; no `alert()` remnants (grep-verified)
- [ ] Screen-reader announcement tested; timers tested with fake clocks

---

### Consistent empty states across routes
labels: area/design-system
estimate: 2 days

**Context:** 404 (#396) and loading skeletons (#397/#408) are done; the *empty-data* middle ground is inconsistent — some lists show bare text, others nothing.

**Tasks:**
- [ ] `EmptyState` component: illustration/icon slot, title, one-line body, primary CTA
- [ ] Author copy per scenario: no delegations (CTA: create wizard #523), no approvals ("You're all caught up"), no orders, no escrows, empty search results (with "clear filters"), wallet with zero history
- [ ] Apply everywhere lists render; include illustrations as lightweight inline SVGs (theme-aware)

**Acceptance criteria:**
- [ ] Every list route audited (checklist in PR description) and covered
- [ ] CTAs route correctly; dark-mode contrast passes

---

### Command palette (⌘K)
labels: area/design-system
estimate: 2 days

**Context:** Navigation is menu-only; power users and demo flows benefit from jump-to-anything. Natural home for hotkey discovery alongside #531.

**Tasks:**
- [ ] Palette modal (uses #540 Modal): fuzzy search over routes (delegations, orders, escrows, approvals, settings…), recent items (localStorage), and quick actions (toggle network, new delegation, export CSV #537)
- [ ] ⌘K / Ctrl+K binding, arrow-key selection, Enter navigates; trap focus; closes on route change
- [ ] Action registry so features register commands incrementally

**Acceptance criteria:**
- [ ] <100ms open latency; no layout shift; lazy-loaded chunk (not in initial bundle)
- [ ] Keyboard-only walkthrough documented in PR

---

### Route transition polish with reduced-motion respect
labels: area/design-system
estimate: 1 day

**Context:** Navigation feels abrupt between the nine route segments; the View Transitions API is supported in modern Chromium/Chrome and degrades safely.

**Tasks:**
- [ ] Enable Next.js view-transitions experiment (or a thin wrapper) for cross-fade/slide on route change
- [ ] Full `prefers-reduced-motion` bypass (#403 established the pattern)
- [ ] Audit: no transition on first load, back/forward included, no flash on slow connections

**Acceptance criteria:**
- [ ] Perceptible-but-subtle improvement in Chrome; zero change in unsupported browsers
- [ ] Reduced-motion users see instant swaps (tested via emulated media)

---

### Version-keyed announcement banner
labels: area/settings
estimate: 1 day

**Context:** Shipping cadence is accelerating (testnet milestone M5 ahead); users have no in-app channel for "new: dispute filing is live" moments.

**Tasks:**
- [ ] `AnnouncementBanner` fed by a static JSON (id, message, link, severity) bundled at build or fetched from the gateway
- [ ] Dismissal stored per announcement id in localStorage — never resurfaces
- [ ] Severity styles (info/success/warning) reusing Badge tones

**Acceptance criteria:**
- [ ] Dismissal persists across sessions; new ids re-show
- [ ] Renders above app shell without shifting layout on close (height animation optional)

---

## G. Settings & Personalization

### Display-currency preference with centralized amount formatting
labels: area/settings
estimate: 2 days

**Context:** Balances convert XLM↔stroops (#300, StroopsInput #313) but display units are inconsistent page-to-page, and there's no fiat framing for mainstream users.

**Tasks:**
- [ ] Settings option: XLM (default) | USDC-equivalent estimate | fiat (USD) — persisted profile-side with localStorage cache
- [ ] `formatAmount(stroops, {context})` util + `<Amount>` component in packages/ui: consistent decimals, thousands separators via `Intl.NumberFormat`, stroops helper-text on inputs
- [ ] Sweep all amount render sites (wallet #300, orders, escrow #307, approvals, analytics) onto it; tooltips show the alternate unit
- [ ] Rates source: env-configurable endpoint with cached fallback and staleness indicator when estimate mode is on

**Acceptance criteria:**
- [ ] Changing preference updates every visible amount without reload
- [ ] Formatter unit tests cover locales, rounding, stroops precision loss cases

---

### PWA manifest and offline shell
labels: area/settings
estimate: 2 days

**Context:** The consumer app is a natural phone-home-screen candidate (busy-professional persona); currently nothing distinguishes it from a tab.

**Tasks:**
- [ ] Web manifest (name, icons incl. maskable, theme colors honoring dark mode #310, standalone display)
- [ ] Service worker (serwist or hand-rolled): precache app shell, network-first for API with offline fallback page listing cached reads
- [ ] Never cache mutating endpoints or auth responses; clear strategy documented
- [ ] Install prompt UX: custom in-app card on eligible devices, dismissible

**Acceptance criteria:**
- [ ] Lighthouse PWA installability passes; airplane-mode reload shows the branded offline screen
- [ ] Auth-gated pages still redirect properly when offline (no broken shells)

---

### "Download my data" account export
labels: area/settings
estimate: 1 day

**Context:** Sovereignty principle (vision doc: users control their data) + regulator-friendly. Distinct from #537's table-scoped CSV — this is whole-account export.

**Tasks:**
- [ ] Settings → Privacy: request full export (profile, delegations, orders, approvals decisions) as downloadable JSON assembled from existing list APIs (paged fetch client-side)
- [ ] Progress UI for large histories; cancel support
- [ ] Include generated-at timestamp and app version in the envelope

**Acceptance criteria:**
- [ ] Export completes for an account with 100+ records without memory blowup (streaming/chunked accumulation)
- [ ] Schema documented in `docs/architecture/export-format.md`

---

## H. Analytics

### Historical spending trend chart with range switcher
labels: area/analytics
estimate: 2 days

**Context:** The analytics page (#311, PR #479's analytics view) shows aggregates; the temporal dimension (weekly grocery rhythm — a flagship use case) is invisible.

**Tasks:**
- [ ] Lazy-loaded `recharts` (dynamic import — keeps initial JS lean per #512 budget) bar or area chart: spend per day/week from the analytics endpoint grouped range
- [ ] Range switcher 7D/30D/90D persisted in URL (align with #510 conventions)
- [ ] Tooltips formatted via #546 `<Amount>`; empty-range state handled
- [ ] Chart container skeleton to avoid CLS while the chunk loads

**Acceptance criteria:**
- [ ] Chart chunk excluded from initial bundle (verifiable in analyzer output, cited in PR)
- [ ] Renders correctly in both themes with AA-contrast series colors

---

### Agent performance scorecards
labels: area/analytics
estimate: 1 day

**Context:** Success metrics in the vision doc track agent accuracy/satisfaction; users choosing between agents have no comparative data surfaced.

**Tasks:**
- [ ] Card grid on analytics: per delegated agent — tasks completed, approval acceptance rate, total spent vs. limit, avg order value
- [ ] Derived from existing analytics/delegation APIs (coordinate field names; fall back to client-side computation from order history if an aggregate endpoint is missing — note which in code)
- [ ] Card links to that agent's delegations (filtered list via #510 params)

**Acceptance criteria:**
- [ ] Numbers reconcile with list-page counts for the same period
- [ ] Zero-agent state renders #542 empty variant

---

## I. Testing & CI

### Playwright E2E for the three golden paths
labels: area/testing
estimate: 3 days

**Context:** Vitest covers units (#399 onward) but zero browser E2E exists; the grant's M5 testnet E2E criterion needs this foundation.

**Tasks:**
- [ ] Playwright setup: config per project (desktop/mobile chrome), baseURL from env, trace/video on retry
- [ ] Mock strategy: route-intercept the gateway API (fixtures aligned with #552) + inject a synthetic `window.freighter` stub returning a test address so wallet flows run deterministically
- [ ] Scenarios: ① connect wallet → wallet page shows address; ② create delegation via wizard (#523) happy path; ③ approval arrive → approve → order status advances
- [ ] npm script + CI job (per-shard artifacts on failure); flake budget documented

**Acceptance criteria:**
- [ ] All three scenarios green locally and in CI, <5 min wall time
- [ ] 10 consecutive local runs with ≤1 flake before merge

---

### MSW mock API layer shared by tests, Storybook, and dev
labels: area/testing
estimate: 2 days

**Context:** Every test/story hand-mocks fetch today; handlers drift from real payloads. Backend types exist in `@delegolabs/types`.

**Tasks:**
- [ ] MSW v2 with `http` handlers covering every endpoint `DelegoClient` calls: delegations CRUD, orders, escrows, approvals, analytics, notifications
- [ ] Typed fixture factories (faker-lite seeds) producing valid `@delegolabs/types` shapes; error/scenario variants (empty, paginated, failing)
- [ ] Wire into vitest setup + a Storybook decorator; optional `NEXT_PUBLIC_MOCK_API=true` dev mode with a worker
- [ ] Document adding a new endpoint (handler + fixture checklist)

**Acceptance criteria:**
- [ ] #551 and new component tests consume the same fixtures
- [ ] Type-check enforces fixture/response alignment (no `any` escapes)

---

### Visual regression screenshots in CI
labels: area/testing
estimate: 2 days

**Context:** Theming (#310/#481) and dense UI changes currently rely on eyeballing; silent style regressions ship.

**Tasks:**
- [ ] Playwright screenshot projects for key pages/states (dashboard, lists populated via #552 fixtures, empty states #542, dark+light, mobile viewport) with masked dynamic regions (addresses, timestamps)
- [ ] Baselines committed; CI job diffs against baselines with upload-on-failure artifact
- [ ] Update policy: `pnpm visual:update` regenerates; PR template checkbox reminds reviewers to inspect image diffs

**Acceptance criteria:**
- [ ] Deterministic runs (fonts/animations frozen); ≤2% pixel noise tolerance configured
- [ ] Full suite <5min in CI

---

### Hook test coverage push to ≥90% (wallet, network, notifications)
labels: area/testing
estimate: 2 days

**Context:** First hook tests landed (#399) but the riskiest hooks — `useWallet` (extension IO), `useNetwork` (persistence), `useNotifications` (event fan-out) — have partial or no coverage; #515/011 will modify them.

**Tasks:**
- [ ] Mock `@stellar/freighter-api` module; cover connect/deny/unavailable/error matrix and (with #515) event subscription lifecycle
- [ ] useNetwork: switch persistence, invalid stored values, listener fan-out
- [ ] useNotifications: add/clear/mark-read races, duplicate suppression, cap size
- [ ] Configure coverage thresholds (90% lines/branches for `hooks/`) enforced in CI; fix incidental uncovered branches or mark with rationale

**Acceptance criteria:**
- [ ] Coverage gate green; report artifact published per PR
- [ ] No `act()` warnings in the suite output

---

### PR preview deployments and required-check hygiene
labels: area/testing
estimate: 1 day

**Context:** Reviewers verify UI changes by checking out branches manually; CI exists (.github/workflows) but previews and protection rules are inconsistent.

**Tasks:**
- [ ] Pick host (Vercel/Netlify/Cloudflare Pages — document choice + cost tier) and wire preview deploy per PR with env vars pointing at the staging gateway; bot comment with URL
- [ ] Mark lint/typecheck/test (+E2E when #551 lands) as required status checks on `main`
- [ ] Auto-cancel superseded in-progress runs; artifact retention trimmed to 7 days

**Acceptance criteria:**
- [ ] Opening a PR yields a working preview within ~3 minutes
- [ ] Direct pushes to `main` blocked by required checks

---

## J. Accessibility, i18n & Documentation

### i18n scaffolding with next-intl and ICU-safe formatting
labels: area/perf-a11y
estimate: 2 days

**Context:** Notifications gained multi-language templates server-side (#357); the UI is English-hardcoded. Global expansion is Phase 4 in `docs/vision.md` — scaffolding now avoids a painful extraction later.

**Tasks:**
- [ ] next-intl with cookie/header-negotiated locale (no URL-prefix routing for now), `en` baseline
- [ ] Extract strings for app shell, nav, common forms, and the delegation wizard; structured namespaces (`nav.*`, `delegations.wizard.*`)
- [ ] Route all dates/numbers through `Intl.DateTimeFormat`/`Intl.NumberFormat` helpers (shared with #546)
- [ ] Language switcher stub in settings; missing-key lint warning in CI logs

**Acceptance criteria:**
- [ ] Adding `de.json` with partial keys renders mixed fallback cleanly (no crashes/blank strings)
- [ ] Extraction covers ≥60% of user-visible strings; remainder tracked in a TODO ledger doc

---

### Dialog/focus accessibility sweep + automated axe gate
labels: area/perf-a11y
estimate: 2 days

**Context:** Foundational a11y shipped (#315, focus-visible #404, reduced-motion #403), but interactive-overlay patterns landing via #540/023/028 need enforced focus discipline, and there is no CI-level a11y net.

**Tasks:**
- [ ] Audit every modal/drawer/popover: focus trap, initial focus placement, Esc handling, focus restoration, `aria-modal`/labelling
- [ ] Add `aria-live` announcements for async outcomes (approval submitted, escrow released, toast arrivals via #541)
- [ ] Integrate `@axe-core/playwright` into #551's suite (and/or a dedicated scan job over all routes with fixtures) — zero critical violations gates merges
- [ ] Document the a11y conventions (focus order, announcement vocabulary) in `docs/frontend-a11y.md`

**Acceptance criteria:**
- [ ] Keyboard-only task walkthrough (connect → delegate → approve → dispute) recorded and linked in the PR
- [ ] axe gate running in CI and red-blocking on critical violations

---

## Suggested sequencing

1. **Foundation first:** #552 (MSW) → #551 (E2E) unlock confident refactors; #539/033/034 (design system) unblock #527/023/028.
2. **Trust surface:** #515 → #518 → #519 → #520 forms the client-side signing chain.
3. **Parallelizable:** Groups D, E, H have no interdependencies once F primitives land — good for multiple contributors.
