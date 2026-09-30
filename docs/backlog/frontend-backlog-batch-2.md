# Frontend Expansion Backlog — Batch 2 (Issues #567 – #641)

75 additional issues sized at **1–3 developer-days each** (~135 dev-days total), authored against `main` @ `e22ccc1`.

**Dedup guarantee:** verified against all 27 open issues at authoring time — the 25 open #508–#557 items (#508–#553) and CI issue #561 are not duplicated. Items that *extend* open work say so explicitly under **Relation to open work**. Completed work from batches 1 (closed) is cited as prior art, never redone.

**Import:** `GITHUB_TOKEN=<token> python3 scripts/import_issues.py docs/backlog/frontend-backlog-batch-2.md`

## Summary

| Group | Issues | Dev-days |
|---|---|---|
| A. Approvals & decisions | #567 – #574 | 14 |
| B. Orders, escrow & refunds | #575 – #584 | 20 |
| C. Wallet & signing trust | #585 – #593 | 18 |
| D. Delegation depth | #594 – #600 | 13 |
| E. Notifications & comms | #601 – #606 | 9 |
| F. Settings & personalization | #607 – #612 | 11 |
| G. Analytics expansion | #613 – #617 | 8 |
| H. Platform, perf & offline | #618 – #626 | 15 |
| I. Quality, testing & devx | #627 – #636 | 19 |
| J. Content, a11y & polish | #637 – #641 | 8 |

---

## A. Approvals & Decisions

### Structured rejection reasons fed back to agents
labels: frontend
estimate: 2 days

**Context:** Rejecting an approval today records only the decision. Agents cannot learn *why*, so the same unsuitable item gets re-proposed — burning the user's patience and the agent's budget.

**Tasks:**
- [ ] Extend the reject action with an optional structured reason select (too expensive / wrong item / wrong merchant / wrong time / other) plus optional free-text detail
- [ ] Render the reason picker inline in the approvals rows and in the decision drawer, defaulting to collapsed ("Add reason")
- [ ] Persist through the approvals API payload; coordinate field name with backend (`rejectionReason` enum + `rejectionNote`)
- [ ] Surface recorded reasons later wherever the approval decision renders (history, timeline events)

**Acceptance criteria:**
- [ ] Rejection without reason still works (backward compatible); with reason, payload validates against schema
- [ ] Reasons render correctly in decision history and ActivityTimeline entries
- [ ] Unit tests cover both paths and payload shape

---

### Decision history page with filters and CSV export
labels: frontend
estimate: 2 days

**Context:** Once an approval is acted on it vanishes from the inbox; users auditing their own behavior (or reconciling expenses) have no record. The approvals lib (`lib/approvals.ts`) already centralizes decision logic to build on.

**Tasks:**
- [ ] New `/approvals/history` route listing decided approvals: item, amount, decision, reason (#567), decided-at, agent, delegation
- [ ] Filters: date range, decision type, agent, delegation; composed AND-style; empty states handled
- [ ] Reuse the URL-sync conventions so filtered views are shareable
- [ ] "Export CSV" button reusing `lib/csv.ts` + `lib/download.ts` (decisions dataset — distinct from #537's orders dataset)

**Acceptance criteria:**
- [ ] History reflects decisions made moments ago without manual refresh
- [ ] CSV opens cleanly in Sheets with stable column schema documented in-code
- [ ] Route registered in navigation and command palette commands

---

### Widget-level error boundaries on dashboard surfaces
labels: frontend
estimate: 1 day

**Context:** A global error boundary exists, but one failing widget (e.g., the analytics chart throwing on malformed data) currently risks blanking the whole page rather than degrading gracefully.

**Tasks:**
- [ ] `<WidgetBoundary>` wrapper: catches render errors in a subtree, renders a compact in-place fallback card (title, retry button) instead of unmounting siblings
- [ ] Apply to home dashboard cards, analytics widgets, and wallet panels
- [ ] Log caught errors to console with component context (Sentry ingestion lands separately via #511 — leave a typed hook point)

**Acceptance criteria:**
- [ ] Forcing a throw inside one widget leaves the rest of the page interactive
- [ ] Retry remounts only that subtree; fallback matches design tokens incl. dark mode
- [ ] Unit test asserts sibling survival

---

### Virtualized approval inbox for large queues
labels: frontend
estimate: 2 days

**Context:** Business users (procurement persona) accumulate hundreds of pending approvals; DOM size makes scrolling and bulk-selection janky long before cursor pagination (#508, open) changes the data layer.

**Tasks:**
- [ ] Introduce `@tanstack/react-virtual` for the approvals list: fixed-height rows, overscan tuned, sticky select-all bar unaffected
- [ ] Preserve focus/hotkey navigation (`useApprovalHotkeys`) across virtual window edges — focused index is logical, not DOM-bound
- [ ] Selection state keyed by id survives row unmount/remount during scroll

**Acceptance criteria:**
- [ ] Smooth 60fps scroll with a seeded 1000-row fixture; DOM node count bounded (~visible + overscan)
- [ ] Hotkeys j/k traverse the full logical list; selection intact after scroll-away-and-back
- [ ] Relation to #508 documented: virtualization is orthogonal to how pages arrive

---

### Price-sanity advisory banner on approvals
labels: frontend
estimate: 1 day

**Context:** Approvers see an item price with no frame of reference. Wherever the payload carries comparison hints (agent reasoning fields land via #530, open), we can warn before a bad approve.

**Tasks:**
- [ ] When `priceHint`/comparable-range data exists on the payload, render an advisory strip: green "within typical range", amber "above recent prices", gray "no data"
- [ ] Amber state requires an extra confirmation tick before Approve enables (skippable, remembered per session)
- [ ] Strictly advisory: never blocks, never fabricates data when hints are absent

**Acceptance criteria:**
- [ ] All three states reachable in tests via fixtures; no hint ⇒ no banner (verified)
- [ ] Copy reviewed for non-alarmist tone; AA contrast in both themes

---

### Pre-SLA-breach re-notification nudge
labels: frontend
estimate: 1 day

**Context:** SLA aging indicators shipped (amber/red badges), but nothing *nags* before breach — pending requests silently age to red while the user works elsewhere.

**Tasks:**
- [ ] As a pending approval approaches its threshold (configurable, default 1h before amber), emit one reminder through the existing in-app + OS notification channels (`useApprovalNotifications`, `useOsNotifications`)
- [ ] Snooze action ("remind me in 2h") persisted per approval id
- [ ] Dedupe: max one outstanding nudge per approval; suppressed entirely while the approvals tab is focused

**Acceptance criteria:**
- [ ] Nudge fires once, snooze honored across reloads, focus suppression tested
- [ ] Threshold configurable in constants; documented alongside #533-era SLA constants

---

### Approve-with-note (conditional approvals)
labels: frontend
estimate: 1 day

**Context:** Sometimes approval comes with strings attached ("approve, but substitute store brand"). There is nowhere to attach that condition, so context lives in chat threads outside the system of record.

**Tasks:**
- [ ] Optional note field on the approve action (rows: popover; drawer: textarea), max 280 chars with counter
- [ ] Persisted on the approval payload (`approvalNote`) and rendered in history/timeline entries with a distinct "note" treatment
- [ ] Coordinate backend field acceptance; degrade to local-only display if API rejects (feature-detected)

**Acceptance criteria:**
- [ ] Notes survive round-trip and render wherever decisions render
- [ ] Length limit enforced client-side; XSS-safe rendering (no raw HTML)

---

### Dual-control approvals above a configurable threshold
labels: frontend
estimate: 3 days

**Context:** Enterprise procurement wants two pairs of eyes on large spends. Backend support is not confirmed — this issue ships the frontend contract behind a flag and coordinates the API shape.

**Tasks:**
- [ ] Flag-gated (#513 registry): when dual-control applies, first approval records an "awaiting countersign" state with who approved; second signer (any other wallet on the delegation's owner list — coordinate semantics) completes it
- [ ] Inbox rows show countersign state; the first approver sees read-only "waiting for countersignature"; self-countersign is blocked with explanation
- [ ] Detail drawer shows both signatures + timestamps once complete

**Coordination:** requires backend persistence for pending countersign states — agree schema before starting; fall back to hiding the feature when capability detection fails.

**Acceptance criteria:**
- [ ] Full two-approver journey demonstrable against staging mocks (MSW scenario)
- [ ] Self-approval path blocked; flag-off behavior identical to today

---

## B. Orders, Escrow & Refunds

### Refund initiation and eligibility-aware tracking UI
labels: frontend
estimate: 3 days

**Context:** The refund process was just specced on the docs side (`docs` commits landing `process refund`), and contracts expose refund-eligibility getters (#173) plus reason codes (#129). Buyers still have no refund surface.

**Tasks:**
- [ ] "Request refund" CTA on eligible orders/escrows, disabled-with-tooltip when the eligibility getter says not-yet (mirrors #576's pattern)
- [ ] Reason select mapped to the agreed reason-code enum (#129) + free-text evidence links
- [ ] Status progression rendered in ActivityTimeline tones: requested → approved/rejected → settled, with amounts (partial refunds included)
- [ ] Coordinate endpoint + payload with payments service before wiring

**Acceptance criteria:**
- [ ] Eligibility gating provably matches getter output on testnet
- [ ] Partial-refund amounts render correctly (formatting shared with #546 utilities)
- [ ] Terminal states hide further actions; double-submission guarded

---

### Release-button eligibility gating with explanatory tooltips
labels: frontend
estimate: 1 day

**Context:** Contracts added a release-eligibility getter (#174), but the UI enables/disables release heuristically. Users deserve *why* a release isn't possible yet.

**Tasks:**
- [ ] Query the eligibility getter (via gateway proxy or direct Soroban RPC through configured `sorobanRpcUrl`) before enabling the release CTA on escrow detail
- [ ] Disabled state renders the exact unmet conditions in a tooltip/popover ("timeout not reached — releases unlock in 2d 4h")
- [ ] Cache per escrow id with sensible TTL; refetch on escrow events

**Acceptance criteria:**
- [ ] Every disabled release has a human-readable reason sourced from getter data
- [ ] No release attempt fires when ineligible (guarded in handler + tested)
- [ ] Poll/event refetch doesn't hammer RPC (request coalescing verified)

---

### Escrow deadline extension request UI
labels: frontend
estimate: 2 days

**Context:** Extension/renewal functions exist contract-side (#323, timeout metadata getters #88/#369) with no buyer-facing surface — deadlines pass silently and escrows stall.

**Tasks:**
- [ ] Countdown near expiry (existing timer patterns) gains an "Request extension" action with duration presets (+1d/+1w/+1m)
- [ ] Show current timeout metadata (original deadline, extensions consumed) from the getter
- [ ] Submit through payments API; optimistic timeline event "Extension requested (+7d)" pending confirmation; failure rolls back cleanly

**Acceptance criteria:**
- [ ] Extension reflected in countdown immediately post-confirmation
- [ ] Presets constrained to contract-allowed bounds (coordination note documents them)
- [ ] Timeline entry appears for all parties viewing the escrow

---

### Escrow fee breakdown disclosure
labels: frontend
estimate: 1 day

**Context:** Platform fees deduct on release (#31) with multi-treasury distribution (#327) and dynamic estimation (#53) — yet users see only net numbers, breeding support tickets ("where did 2% go?").

**Tasks:**
- [ ] Fee line on escrow detail and receipts: gross, fee amount + % (when static) or "estimated" badge (when dynamic), net proceeds
- [ ] Expandable breakdown when multiple treasuries apply (data permitting — coordinate response shape)
- [ ] Consistent formatting via shared amount utils

**Acceptance criteria:**
- [ ] Numbers reconcile with on-chain released amounts on a testnet escrow (manual verification checklist in PR)
- [ ] Missing fee-config data renders "—" rather than zeros (no false precision)

---

### Delivery-proof viewer on fulfillment steps
labels: frontend
estimate: 2 days

**Context:** Orchestrator validates delivery proofs (#209) before settlement, but buyers can't see the evidence that triggered auto-release — undermining trust in auto-settlement.

**Tasks:**
- [ ] When a fulfillment/timeline event carries proof attachments (images, tracking URLs, hashes), render a "View proof" expander inside the ActivityTimeline entry (component accepts rich detail slots already)
- [ ] Image lightbox (reuse Modal primitive from open #540 when it lands; interim simple overlay), hash values with copy-to-clipboard + explorer link when resolvable
- [ ] Graceful placeholder when proofs are hashes-only ("cryptographic receipt")

**Acceptance criteria:**
- [ ] All attachment types render or degrade intentionally (fixture-matrix tested)
- [ ] Lightbox traps focus and closes on Esc consistent with #540 conventions

---

### Cancel-within-grace-period undo flow
labels: frontend
estimate: 2 days

**Context:** Orchestrator implements cancellation grace periods with automated timers (#55). The UI treats cancel as instant and irreversible — users panic-cancel then discover there was a window.

**Tasks:**
- [ ] Cancel action enters "cancelling…" state with a visible grace countdown ("Undo until 14:32") sourced from the workflow's grace expiry
- [ ] Undo restores prior state optimistically; letting the timer lapse finalizes with a timeline event
- [ ] Banner persists across reloads until finalized or undone

**Acceptance criteria:**
- [ ] Timer authoritative from server timestamp (client clock skew handled; tested with offsets)
- [ ] Undo race with expiry resolves deterministically (server-wins, UI reconciles)
- [ ] Both outcomes produce correct timeline entries

---

### On-chain receipts viewer (contract receipt getters)
labels: frontend
estimate: 2 days

**Context:** Buyer, merchant, and permission receipt getters landed on-chain (#170, #171, #180). These are cryptographic proof artifacts — distinct from #536's (open) printable order receipt document. This issue surfaces the *verification* view.

**Tasks:**
- [ ] "Verify on-chain" section on order/escrow detail: fetch receipt getter data, display field-by-field with checkmarks, link each value's explorer origin
- [ ] Mismatch detector: compare on-chain receipt fields against locally displayed order data; any divergence raises a prominent integrity warning
- [ ] Raw JSON toggle for power users; copy-verified-hash affordance

**Acceptance criteria:**
- [ ] Match case shows calm green verification; mismatch case (simulated fixture) shows loud, actionable warning
- [ ] Getter calls cached/coalesced; explicit relation-to-#536 note in code comments prevents future conflation

---

### Multi-select batch operations for escrows
labels: frontend
estimate: 2 days

**Context:** Batch escrow operations exist contract-side (#317); buyers with several active escrows repeat identical actions one-by-one.

**Tasks:**
- [ ] Checkbox multi-select on the escrows list with a sticky action bar (release-eligible count, request-extension, export)
- [ ] Per-action eligibility filtering: ineligible selections are excluded with inline reasons rather than blocking the batch
- [ ] Sequential execution with concurrency cap and per-item result report (pattern mirrors open #529 for approvals — share the runner utility)

**Acceptance criteria:**
- [ ] Mixed-eligibility batch executes only valid items and reports exclusions clearly
- [ ] Extracted batch-runner utility is reused by #529 (refactor noted, no duplicated logic)

---

### Stuck-transaction monitor with fee-bump guidance
labels: frontend
estimate: 2 days

**Context:** User-signed transactions (post-#520) can sit pending during congestion; silence reads as failure and triggers duplicate submissions — a fund-safety hazard.

**Tasks:**
- [ ] Track submitted tx hashes (session + localStorage); poll Soroban RPC/Horizon status with capped retries
- [ ] >60s pending ⇒ inline status card: "still propagating", elapsed time, explorer link, and *safe* guidance (do not resend; wait or bump fee if wallet supports)
- [ ] Terminal success/failure updates the originating UI context (escrow release, approval) and prunes stored hashes

**Acceptance criteria:**
- [ ] Success/failure/timeout paths each covered with mocked RPC sequences
- [ ] No unbounded growth of tracked hashes; private-key-free by design (hashes only)
- [ ] Duplicate-submit guard demonstrated in test

---

### Lightweight order-issue triage flow (pre-dispute)
labels: frontend
estimate: 2 days

**Context:** Disputes (#535, open) are heavyweight by design. Many complaints ("late delivery") resolve informally — but today the only in-app path is jumping straight to dispute.

**Tasks:**
- [ ] "Report a problem" on orders: category select (late / damaged / not received / other), optional message, optional photo attach URL
- [ ] Submission creates a low-stakes issue ticket routed to merchant/agent channels (coordinate endpoint); sets an "issue open" chip distinct from DISPUTED
- [ ] Handoff affordance: unresolved after N days ⇒ prominent "escalate to formal dispute" CTA deep-linking into #535's flow with context pre-filled

**Acceptance criteria:**
- [ ] Issue and dispute states never conflate in UI or payloads (distinct enums asserted in tests)
- [ ] Escalation deep-link carries category/message forward (no retyping)
- [ ] Chip styling passes contrast in both themes

---

## C. Wallet & Signing Trust

### Human-readable transaction preview before wallet signing
labels: frontend
estimate: 2 days

**Context:** Wallet extensions show raw XDR blobs most users can't evaluate — the weakest link in delegated-commerce trust. We hold the context (which contract, which method, which amounts) and can decode before handing to Freighter.

**Tasks:**
- [ ] `decodeTransactionPreview(xdr)` helper: parse operations via `@stellar/stellar-sdk`, map known contract invocations (escrow release, permission spend) to friendly summaries ("Release 45.2 XLM from escrow #82 to merchant GABC…")
- [ ] Preview modal renders summary + destination addresses (truncated w/ copy) + fee + memo before invoking adapter `signTransaction`
- [ ] Unknown-operation fallback shows honest "unrecognized operation" with raw details — never guesses

**Acceptance criteria:**
- [ ] Known flows produce exact-match summaries in tests (golden XDR fixtures committed)
- [ } Preview appears on every signing call site; skip-path exists for automated tests only (flag)
- [ ] No secret material ever rendered or logged

---

### Spend-preview simulator for delegations ("dry-run a purchase")
labels: frontend
estimate: 2 days

**Context:** Contracts expose a `SpendPreview` read-only dry-run (#183). Letting users ask *"if Nova buys a 30 XLM item right now, what happens?"* turns abstract limits tangible and pre-empts rejected spends.

**Tasks:**
- [ ] Simulator panel on delegation detail: amount input (StroopsInput), optional merchant, "Simulate" button hitting the preview function via gateway/RPC
- [ ] Result card: allowed/denied, remaining-after figure, which constraint bound the decision (cap, whitelist, pause, expiry) with plain-language mapping
- [ ] Denied results link to the relevant fix (raise cap → edit limits; expired → renew #597)

**Acceptance criteria:**
- [ ] Each denial-reason class renders its specific remediation link (fixture-tested)
- [ ] Simulations are provably read-only (no spend-side mutation call sites touched; code-comment invariant)
- [ ] Loading/empty/error states designed, not inherited defaults

---

### Address book with labeled recipients and verification marks
labels: frontend
estimate: 2 days

**Context:** Merchants/agents appear as raw G… addresses everywhere; typos and impostor addresses are a classic loss vector in crypto commerce.

**Tasks:**
- [ ] Local-first address book (localStorage, synced when profile storage allows): label, address, network, notes, "verified" mark (manual tick + optional on-chain/TOML domain check)
- [ ] Picker integrated wherever an address is displayed as send-target or shown in previews (#585) — known addresses render as "Label (GABC…XYZ)"
- [ ] Duplicate/impostor detection: warn when a pasted address differs by ≥1 char from a saved one (edit-distance check)

**Acceptance criteria:**
- [ ] CRUD complete with search; entries network-scoped (testnet/mainnet never mix)
- [ ] Near-miss warning demonstrably fires on single-character substitutions (tested)
- [ ] Export/import JSON for backup (reuse download helper)

---

### Watch-only address tracking
labels: frontend
estimate: 2 days

**Context:** Users managing family/business wallets want visibility without key custody — pure Horizon reads on any public address.

**Tasks:**
- [ ] "Track address" on wallet page: adds watch-only entries (label + address) listed beside connected wallets with a clear WATCH badge
- [ ] Balances + recent activity fetched via Horizon for watched addresses; refresh cadence modest (60s, paused hidden)
- [ ] Hard separation: watch-only entries can never appear in signing contexts (adapter lookups filter them; invariant test)

**Acceptance criteria:**
- [ ] Add/remove/search watch list persists across sessions
- [ ] Signing surfaces provably exclude watch-only entries (unit-invariant)
- [ ] Unfunded/invalid addresses handled with clear states

---

### Quick account switcher for multi-account wallets
labels: frontend
estimate: 1 day

**Context:** Freighter holds multiple accounts; the header shows whichever is active with no in-app way to see or anticipate a switch (event subscription itself lands via open #515 — this is the deliberate UI on top).

**Tasks:**
- [ ] Header avatar menu listing Freighter accounts (via `requestAccess`-adjacent APIs where exposed; else document limitation and show current-only)
- [ ] Selecting another account triggers the extension switch and lets #515's event flow resync state — no duplicate source of truth
- [ ] Active account identity reinforced: truncated address + label everywhere transactable CTAs render

**Acceptance criteria:**
- [ ] Switching reflects across all surfaces ≤1s without reload (when extension supports enumeration)
- [ ] Graceful single-account experience unchanged; no dead menu when enumeration unsupported
- [ ] Depends-on note references #515 explicitly in code

---

### Ledger hardware wallet support via adapter
labels: frontend
estimate: 3 days

**Context:** High-value delegators want keys off-browser entirely. Stellar Ledger support exists via transport libs and plugs cleanly into the adapter interface introduced by closed #516 work (verify current adapter surface before starting).

**Tasks:**
- [ ] Implement `LedgerAdapter` (WebUSB/Transport-based per maintained stellar-ledger lib): detect, connect, getAddress (derive path picker), getNetwork, signTransaction (device confirmation required)
- [ ] Device-interaction UX: "Confirm on your Ledger" persistent state with troubleshooting tips (locked device, wrong app open)
- [ ] Sign-flows (#520 descendants) route through the adapter transparently; network mismatch guarded like extensions

**Acceptance criteria:**
- [ ] Real-device happy path on testnet documented with screenshots (device required — PR reviewer coordination noted)
- [ ] Absent-device states never crash connect flows; adapter failures isolated to wallet surfaces
- [ ] Dependency license/audit checked and recorded

---

### Personal signing-consent log
labels: frontend
estimate: 1 day

**Context:** After-the-fact, users can't answer "what did I sign recently?" — wallet extensions keep their own opaque history. A local consent journal restores auditability (vision principle: transparent delegation).

**Tasks:**
- [ ] Record on every successful signature: timestamp, decoded summary (reuse #585 decoder), tx hash, source screen; append-only localStorage journal with size cap (e.g., 200 entries FIFO)
- [ ] Settings → Security: journal viewer with search/filter and explicit "clear journal" (confirm modal)
- [ ] Entries deep-link to explorer; failed/rejected signatures logged with outcome for completeness

**Acceptance criteria:**
- [ ] Journal survives restarts; cap enforced; clear-all requires confirmation
- [ ] No sensitive material beyond public tx data (reviewed; tested)
- [ ] Viewer keyboard-navigable and screen-reader friendly

---

### Clipboard hygiene for sensitive copies
labels: frontend
estimate: 1 day

**Context:** Copying full addresses/secrets leaves them on the clipboard indefinitely — a real paste-somewhere-wrong hazard on shared machines.

**Tasks:**
- [ ] Central `copySensitive(value)` util wrapping all copy actions for addresses/hashes/journals: copies, shows the existing toast confirmation, then clears clipboard after 30s (best-effort across browsers, documented)
- [ ] Sweep call sites: address copy buttons, tx hash links, export contents, journal viewer (#591)
- [ ] Regular (non-sensitive) copies unaffected

**Acceptance criteria:**
- [ ] All sensitive copy sites routed through the util (grep-audited list in PR)
- [ ] Clearance timer cancelled if user copies something else meanwhile
- [ ] Behavior matrix per browser documented in-code (permissions API constraints)

---

### Official-domain warning banner (anti-phishing)
labels: frontend
estimate: 1 day

**Context:** Popular fintech UIs get cloned on lookalike domains to harvest approvals. The app can self-identify its canonical host and warn when running elsewhere.

**Tasks:**
- [ ] Canonical host list in env/config; on boot compare `window.location.hostname`; on mismatch render a persistent dismissible-per-session danger banner ("You're not on delego.app — transactions here may not be trustworthy")
- [ ] Never renders on localhost/preview hosts (allowlist for dev/PR previews)
- [ ] Banner copy reviewed with security@ contact linked

**Acceptance criteria:**
- [ ] Lookalike-host simulation triggers banner; allowlisted hosts never do (test matrix)
- [ ] Banner is non-closable per navigation within the offending session (per-session dismissal only)
- [ ] Config absent ⇒ feature inert (no false positives)

---

## D. Delegation Depth

### Agent health/status chips from DelegateStatusView
labels: frontend
estimate: 1 day

**Context:** `DelegateStatusView` (#484) reports delegate state on-chain; delegation cards still guess agent health from order outcomes.

**Tasks:**
- [ ] Fetch status per delegation (batched/cached); render chip: Active / Paused / Expired / Threshold-reached with tooltip detail
- [ ] Chip drives affordances: Expired offers renew (#597), Paused offers resume (existing controls), keeping one mental model
- [ ] Stale-tolerance: show last-known with subtle "as of X min ago" when fetch fails

**Acceptance criteria:**
- [ ] Each status class fixture-tested including tooltip content
- [ ] Batched fetching respects request budgets (no N+1 spam — coalescing verified)
- [ ] Chips consistent across list, detail, and approvals context headers

---

### Delegation templates gallery
labels: frontend
estimate: 2 days

**Context:** The vision doc's flagship scenarios (weekly groceries, subscription management, office supplies) share recognizable scopes. Templates compress wizard friction; `lib/delegationFormIntent.ts` already models form intents to extend.

**Tasks:**
- [ ] Template definitions (static JSON, versioned): scope categories, suggested caps, threshold defaults, friendly copy
- [ ] Gallery grid on "New delegation" entry (and inside wizard step 1 as "Start from a template"): selecting pre-seeds the wizard — pure input prefill, zero magic writes
- [ ] "Blank" template remains first-class; templates marked as suggestions, never silently applied limits

**Acceptance criteria:**
- [ ] Every template produces a valid wizard state (schema-tested against wizard's validation)
- [ ] Prefill is fully editable; review step (#523, open) shows final truth
- [ ] Adding a template = data-only change (no component edits; documented)

---

### Sub-delegation (inheritance chain) visualization
labels: frontend
estimate: 2 days

**Context:** Permission inheritance chains exist on-chain (#332); parent/child relationships are invisible, so users can't see aggregate exposure ("Nova granted Otto 10 XLM of her 50").

**Tasks:**
- [ ] Tree view on delegation detail: parent ↔ children edges with per-node remaining caps; aggregate exposure total computed up the chain
- [ ] Cycle/orphan tolerance (chain data may arrive partial); expandable nodes lazy-fetch children
- [ ] Aggregate-over-limit states highlighted with plain-language risk note

**Acceptance criteria:**
- [ ] Deep chains (≥4 levels) render sanely (fixture); cycles detected and flagged, never loop
- [ ] Exposure math unit-tested incl. rounding across levels
- [ ] Empty (childless) delegations show no tree chrome

---

### Renewal reminders with one-click renew
labels: frontend
estimate: 2 days

**Context:** Expiry countdowns shipped (#305 wave, refined later) but expiry still means dead delegation + manual recreation. Renewal functions exist (#320).

**Tasks:**
- [ ] T-minus banners on delegations expiring within 7d ("Renew keeps settings; new expiry required") + notification-center digests
- [ ] One-click renew modal: pre-filled from current delegation, only expiry (and optional cap adjustments) editable; submits renewal through the supported path (coordinate renew-vs-recreate semantics with backend)
- [ ] Post-renewal state refreshes chips (#594) and countdowns in place

**Acceptance criteria:**
- [ ] Renewal preserves immutable fields exactly (diff-asserted in tests)
- [ ] Reminder fires once per threshold, not per render (dedupe persisted)
- [ ] Lapsed delegations route to recreate-with-prefill instead (clear, distinct CTA)

---

### Spending velocity alert configuration UI
labels: frontend
estimate: 1 day

**Context:** On-chain spending velocity checks (rate limiting) landed (#324) — invisible to users until a burst buy bounces. Surfacing the knob converts a confusing failure into a controlled setting.

**Tasks:**
- [ ] Velocity section in delegation limits editing: max spends per hour/day toggles with numeric inputs; unset = contract default (displayed)
- [ ] Friendly explanation of tradeoffs (tighter = fraud-resilient, may block legitimate bursts like weekly stock-up)
- [ ] When a spend is denied by velocity, denial mapping (shared with #586's reason classes) names the rule hit

**Acceptance criteria:**
- [ ] Values validate against contract bounds (coordinate; documented in code)
- [ ] Denial attribution verified for velocity vs cap vs whitelist classes (fixtures)
- [ ] Defaults render even when user never configured (read-through)

---

### Bulk pause/resume for delegations
labels: frontend
estimate: 1 day

**Context:** Single-delegation pause/resume shipped; incident response ("new agent rumor — pause everything") demands portfolio-level action. Pattern-share with open #529's batch runner (and #582's extraction).

**Tasks:**
- [ ] Multi-select on delegations list + "Pause all selected"/"Resume all" with confirmation summarizing count and effect
- [ ] Shared batch-runner utility (extracted per #582) with per-item outcomes and retry-failed
- [ ] Portfolio-wide "Pause everything" master action in settings/danger-tools with typed confirmation

**Acceptance criteria:**
- [ ] Mixed paused/active selection behaves predictably (pause affects only active, and vice versa — stated in confirm copy)
- [ ] Runner reuse verified (no forked logic; lint rule or review checklist)
- [ ] Master action requires typing "PAUSE ALL"

---

### Delegation labels and color tags
labels: frontend
estimate: 1 day

**Context:** Multi-delegation users ("groceries", "client-A procurement") can't visually partition portfolios; everything renders as uniform cards.

**Tasks:**
- [ ] Free-text label + palette-tag (8 accessible colors) per delegation; editable inline on detail, via row menu on lists
- [ ] Filter-by-label chips on lists; label shown on cards, approvals context headers, and timeline entries
- [ ] Stored client-side first (localStorage) with profile-sync when available (coordinate)

**Acceptance criteria:**
- [ ] Colors meet AA on both themes (pre-approved palette only)
- [ ] Filters compose with existing query-param sync conventions
- [ ] Unlabeled delegations render identically to today (zero regression)

---

## E. Notifications & Comms

### Web-push device manager
labels: frontend
estimate: 2 days

**Context:** OS notifications shipped (closed wave) and backend cleans stale subscriptions (#137), but users can't see or revoke *their own* registered devices.

**Tasks:**
- [ ] Settings → Notifications → Devices: list active push subscriptions (name/OS heuristic, last-seen, current-device badge), revoke per entry and "sign out everywhere" bulk
- [ ] Current-device unsubscribe fully tears down the local SW push state too
- [ ] Coordinate listing endpoint shape; graceful empty state when push unsupported (iOS browsers pre-permission)

**Acceptance criteria:**
- [ ] Revoked device stops receiving within one poll cycle (staging verification steps documented)
- [ ] Current-device teardown verified end-to-end (subscribe → revoke → no re-register until re-enabled)
- [ ] Unsupported platforms render informative copy, never broken controls

---

### Quiet hours schedule for notifications
labels: frontend
estimate: 1 day

**Context:** Urgent approvals deserve alerts; routine "order shipped" at 3am does not. Nothing mediates urgency today.

**Tasks:**
- [ ] Quiet-hours setting: start/end time (Intl-localized inputs), day-of-week mask, and severity bypass toggle ("always allow approvals")
- [ ] Evaluation gate in the notification dispatch path (client-side for in-app/OS; server digest coordination noted for email)
- [ ] Suppressed items visibly queued ("2 muted while quiet hours") — nothing silently lost

**Acceptance criteria:**
- [ ] Boundary math handles overnight windows (22:00–07:00) and DST via Intl (tested)
- [ ] Bypass class (approvals) pierces quiet hours when enabled; muted queue drains on window close
- [ ] Setting persisted and respected across reloads

---

### Daily digest toggle
labels: frontend
estimate: 1 day

**Context:** Backend notification scheduling with cron exists (#365). A daily summary tames alert fatigue for casual users without muting anything outright.

**Tasks:**
- [ ] Preference: "Off / Instant / Daily digest" per major channel; digest time picker (defaults 09:00 user-tz)
- [ ] Digest content spec coordinated with notifications service (pending approvals, yesterday's settlements, expiring delegations)
- [ ] Frontend presents upcoming-digest preview ("Next digest tomorrow 09:00 — will include 3 pending approvals")

**Acceptance criteria:**
- [ ] Preference round-trips to backend and survives reload (round-trip test)
- [ ] Instant-vs-digest mutual exclusion clear in UI copy (no silent override)
- [ ] Preview line accurate against live counts (integration-checked on staging)

---

### Thread notifications by delegation
labels: frontend
estimate: 2 days

**Context:** One busy delegation produces notification spam (created → priced → awaiting approval → shipped…). Threading restores signal.

**Tasks:**
- [ ] Group notification-center entries by delegation id (collapsible stacks, unread-count rollup, latest-preview)
- [ ] Stack actions: "mark all read", open delegation detail; expanding reveals chronological entries
- [ ] Ungroupable items (system notices) stay top-level; grouping toggle in center settings (default on)

**Acceptance criteria:**
- [ ] Rollup counts reconcile with expanded items (property-tested on shuffled fixtures)
- [ ] Read-state consistency: reading stack marks children appropriately, no phantom unreads
- [ ] Toggle off restores flat chronology exactly (regression-tested)

---

### Notification retention preference
labels: frontend
estimate: 1 day

**Context:** The in-app center grows unbounded client-side; old noise buries signal, and privacy-minded users want auto-cleanup.

**Tasks:**
- [ ] Retention selector: 7 / 30 / 90 days or keep-all (default 30); pruning runs lazily on center open + on boot
- [ ] Pruned-but-unread handling: unread items always survive past window (explicit rule, surfaced in copy)
- [ ] "Clear all now" manual action with undo snackbar (soft-delete window)

**Acceptance criteria:**
- [ ] Prune math edge cases tested (boundary timestamps, timezone drift)
- [ ] Undo restores cleared items within session; hard-clear after dismissal
- [ ] Storage footprint capped (verified with seeded 10k-entry stress fixture)

---

### Rich payloads in OS notifications
labels: frontend
estimate: 1 day

**Context:** Current OS notifications are text-only blips. Browsers support icons/badges/actions — an approval notification with item thumbnail and Approve/Reject actions collapses time-to-decision.

**Tasks:**
- [ ] Extend `useOsNotifications` payloads: icon (item image proxied/resized), tag for dedupe (already partly needed by #572), and action buttons where supported (`actions` support matrix documented — Chrome yes, Safari limited)
- [ ] Action clicks route straight to decision handlers with confirmation (never silent approve — require the app surface to finalize, mirroring #585 caution)
- [ ] Fallback rendering identical to today where actions unsupported

**Acceptance criteria:**
- [ ] Capability detection switches payload shapes (matrix-tested)
- [ ] Action buttons never finalize decisions directly — open-app-then-confirm flow asserted
- [ ] Icon loading failures degrade to app icon silently

---

## F. Settings & Personalization

### Accessibility preferences panel
labels: frontend
estimate: 2 days

**Context:** System-preference respect exists (reduced-motion, dark mode), but users whose *system* settings differ from what they need *in-app* (low vision on default-motion machine) have no overrides.

**Tasks:**
- [ ] Settings → Accessibility: text scale (90–150% via root font-size clamp), forced high-contrast theme toggle, reduce-motion override (on/off/system), underline-links toggle
- [ ] Preferences persist and apply pre-hydration (inline script pattern matching theme bootstrapping) to avoid flashes
- [ ] Text-scale QA pass across key pages catching hardcoded px offenders (fix or convert to rem — enumerate in PR)

**Acceptance criteria:**
- [ ] 150% text scale leaves key flows usable (wizard, approvals) with zero clipped controls (screenshot evidence)
- [ ] Overrides win over system prefs; "system" resets cleanly
- [ ] Persistence flash-free on reload (bootstrapping verified)

---

### Timezone and time-format preferences
labels: frontend
estimate: 1 day

**Context:** Timestamps render in browser-local time implicitly via scattered `Intl` calls (`lib/intl.ts` centralizes some). Travelers and cross-border buyers (vision use case) need control; 12/24h is a basic expectation.

**Tasks:**
- [ ] Settings: timezone override (Auto + searchable tz list from Intl API), clock format (12/24h), first-day-of-week
- [ ] Route all date/time renders through extended `lib/intl.ts` helpers honoring prefs (sweep call sites; enumerate conversions in PR)
- [ ] Relative times ("2h ago") recomputed against chosen tz consistently

**Acceptance criteria:**
- [ ] Changing tz updates visible timestamps without reload (reactive store)
- [ ] Sweep inventory documents every converted call site (grep list attached)
- [ ] Boundary: #546 (open) owns *money* formatting — clean seam documented between the two helpers

---

### Language pack completion and RTL readiness
labels: frontend
estimate: 2 days

**Context:** next-intl scaffolding shipped (closed wave; `acceptLanguage` negotiation present) with partial extraction. Phase-4 global expansion needs the remaining strings plus right-to-left correctness for Arabic/Hebrew.

**Tasks:**
- [ ] Extraction completion sprint: sweep remaining hardcoded strings (ledger from #556-era TODO doc), namespaces tidied
- [ ] Add one RTL locale (e.g., `ar`) with logical-property CSS fixes (`margin-inline-*` etc.) and `dir` switching; mirror icons where directional
- [ ] Pseudo-locale dev tool (`?lang=xx-XS`) exposing untranslatable leftovers instantly (lengthening + brackets)

**Acceptance criteria:**
- [ ] Zero hardcoded user-facing strings detected by pseudo-locale smoke pass over primary routes
- [ ] RTL screenshot set reviewed; no broken mirrored layouts in shell/nav/lists
- [ ] Translation-contributor guide updated (how to add a locale)

---

### Data-erasure request flow
labels: frontend
estimate: 1 day

**Context:** Account export shipped (closed wave). Erasure — the other half of data sovereignty — has no surface, though the vision doc promises user control of data.

**Tasks:**
- [ ] Settings → Privacy → "Delete my data": tiered options (clear local caches/journal vs request full server-side erasure) with distinct consequences copy
- [ ] Server-tier requires typed confirmation + cooldown screen ("request logged; final in 30 days; contact support to cancel"), coordinating the backend request endpoint
- [ ] Post-request state visible ("Erasure pending since …") with cancel affordance

**Acceptance criteria:**
- [ ] Local-only tier executes immediately and verifiably (storage inspection checklist)
- [ ] Server tier never destructive client-side; purely request/cancel lifecycle until backend confirms
- [ ] Copy reviewed for legal tone; support contact linked

---

### Connected sessions/devices overview
labels: frontend
estimate: 2 days

**Context:** Auth infrastructure matured (JWT wave, refresh tokens #48) but users can't see where they're logged in — table-stakes security UX.

**Tasks:**
- [ ] Settings → Security: active sessions list (current highlighted; device/browser heuristic, last-active, IP region coarse) from the auth service (coordinate endpoint; mock-first)
- [ ] Revoke single session + "all other sessions"; revoked sessions' next request lands on login redirect (existing 401 path)
- [ ] Honest degradation: when the endpoint lacks data, explain rather than fake rows

**Acceptance criteria:**
- [ ] Revoke-other-sessions demonstrably invalidates a second staged session (staging script in PR)
- [ ] Mock-backed UI complete behind capability detection (MSW scenario committed)
- [ ] Current-session row can't revoke itself (guarded + tested)

---

### Privacy/telemetry consent center
labels: frontend
estimate: 2 days

**Context:** `lib/analytics.ts` emits product-analytics events with no user-facing consent gate. GDPR-style consent should be explicit, revocable, and actually wired to emission.

**Tasks:**
- [ ] Consent model: essential (always on, non-tracking) vs product-analytics vs marketing — stored, mutable, auditable (timestamped consent log)
- [ ] First-run minimal banner (essential-only by default; "Accept all" / "Customize"); Settings → Privacy full center with per-category toggles and "what we collect" plain-language disclosures
- [ ] Gate `analytics.ts` emitters behind consent flags at the single choke point; queued-before-choice events dropped or held per policy choice (document which)

**Acceptance criteria:**
- [ ] With analytics consent off, no emitter fires (choke-point test with spy)
- [ ] Consent changes take effect immediately incl. mid-session; log view shows history
- [ ] Banner never blocks interaction (dismissable, non-modal)

---

## G. Analytics Expansion

### Period-over-period delta cards
labels: frontend
estimate: 1 day

**Context:** Trend chart shipped (closed wave) but headline KPI cards lack directionality — "is 240 XLM this week good?" needs ▲/▼ vs previous period with context.

**Tasks:**
- [ ] Compute deltas client-side from existing series data (no new endpoints): spend, order count, avg order value, approval rate — each with % change chip (green/red semantics chosen carefully: spend-down = green)
- [ ] Range switcher (existing 7/30/90D) drives comparison windows automatically
- [ ] Null-safety: insufficient prior data renders "—" not misleading 0%

**Acceptance criteria:**
- [ ] Delta math property-tested (incl. divide-by-zero prior windows)
- [ ] Chips inherit semantic-color tokens (AA in both themes); arrows paired with text (color-blind safe)
- [ ] Cards animate subtly on range change, reduced-motion respected

---

### Category/task-type spend breakdown
labels: frontend
estimate: 2 days

**Context:** Vision scenarios imply natural categories (groceries, subscriptions, supplies); aggregate spend hides where money actually goes.

**Tasks:**
- [ ] Donut/bar breakdown by task-category (source: order/delegation metadata — coordinate canonical category taxonomy; fallback bucket "Other" always present)
- [ ] Click-through: selecting a slice filters the underlying orders table (URL params per #510 conventions)
- [ ] Legend doubles as toggle-filter; percentages + absolute amounts both shown

**Acceptance criteria:**
- [ ] Slice sums reconcile with total (±rounding stated explicitly in UI)
- [ ] Taxonomy gaps degrade to Other (fixture-tested) — never drop spend from the total
- [ ] Chart chunk shares the existing lazy-loaded recharts bundle (budget-neutral, analyzer output cited)

---

### Limit-utilization heatmap per delegation
labels: frontend
estimate: 2 days

**Context:** Burn-down bars show *now*; a calendar heatmap (GitHub-contribution style) shows rhythm — spotting the delegation that spikes every Friday informs limit tuning.

**Tasks:**
- [ ] 12-week × 7-day grid per delegation (or aggregated portfolio view): cell intensity = spend that day; tooltip via shared Amount formatting
- [ ] Data derived client-side from daily spend series (same source as trend chart); empty days flat-colored
- [ ] Toggle between per-delegation and portfolio-total heatmaps

**Acceptance criteria:**
- [ ] Cell math matches series sums (spot-check tests); timezone-day-bucketing consistent with #608 prefs
- [ ] Renders performantly (pure SVG, no chart-lib dependency)
- [ ] Color ramp perceptually uniform and colorblind-safe (documented choice)

---

### Agent leaderboard (sortable, comparable)
labels: frontend
estimate: 1 day

**Context:** Agent scorecards shipped (closed wave) as cards; comparative scanning ("which agent saves me more?") needs a dense sortable table.

**Tasks:**
- [ ] Table view: agent, tasks, success rate, avg savings, total spent, active delegations — sortable columns with direction indicators, sticky header
- [ ] Row click → agent-filtered views (delegations/orders) reusing URL-param conventions
- [ ] Mobile: table collapses to condensed cards preserving sort

**Acceptance criteria:**
- [ ] Sorting stable and type-correct (numeric vs lexicographic columns tested)
- [ ] Figures reconcile with scorecard cards for the same period (cross-check test or manual matrix)
- [ ] Keyboard-sortable via header buttons; aria-sort attributes correct

---

### Printable weekly summary report
labels: frontend
estimate: 1 day

**Context:** Finance workflows (procurement persona) need a shareable weekly artifact — not raw CSV (#537, open) but a formatted summary for forwarding/approval chains.

**Tasks:**
- [ ] "Weekly report" view: period header, KPI deltas (reuse #613 components in print variant), top delegations table, notable events (disputes opened, limits hit)
- [ ] Dedicated print stylesheet (clean A4, brand header, page numbers via CSS counters); "Copy summary as text" for email paste
- [ ] Generated entirely client-side from existing stores — zero new endpoints

**Acceptance criteria:**
- [ ] Print preview clean on Chrome/Firefox at A4/Letter (screenshots in PR)
- [ ] Text-copy variant survives markdown-strip into plain email legibly (manual matrix attached)
- [ ] Report period selectable (last N weeks), state URL-addressable

---

## H. Platform, Perf & Offline

### Offline mutation queue with replay and conflict UX
labels: frontend
estimate: 3 days

**Context:** PWA shell + offline reads shipped (closed wave; `lib/offlineCache.ts`). Mutations offline simply fail — but approvals made on a subway should survive tunnels.

**Tasks:**
- [ ] Queue approved mutation classes (approval decisions, delegation pause) in IndexedDB with idempotency keys; background replay on reconnect (online event + periodic sweep)
- [ ] Replay order preserved per resource; conflicts (409/stale-state on replay) surface a resolution card ("state changed while offline — review") instead of silent overwrite
- [ ] Pending-offline indicators on affected rows; queue inspector hidden debug view behind flag

**Acceptance criteria:**
- [ ] Airplane-mode E2E: decide offline → reconnect → decision applied exactly once (idempotency verified server-side or via dedupe keys)
- [ ] Conflict path never auto-forces; user resolves explicitly (scenario test)
- [ ] Queue persistence survives restart; poisoned entries (permanent rejection) quarantined with user notice

---

### IndexedDB read-model cache beyond the SW runtime cache
labels: frontend
estimate: 2 days

**Context:** `offlineCache.ts` covers shell basics; structured data (lists, detail objects) should hydrate instantly from last-known-good on flaky networks, with background revalidation.

**Tasks:**
- [ ] Tiny cache layer (idb-keyval or hand-rolled, no heavy dep): versioned per query-family, TTLs per resource type, size-capped LRU
- [ ] Hook wrappers: serve cached → revalidate → reconcile (stale-while-revalidate semantics documented per family)
- [ ] Cache-buster in settings ("Clear offline data") with usage stats shown

**Acceptance criteria:**
- [ ] Cold-start on airplane mode renders last data with explicit staleness badges (per family TTL displayed honestly)
- [ ] Version migrations drop stale shapes safely (upgrade test)
- [ ] Cap enforcement evicts LRU families first (stress-tested)

---

### Virtualized long tables for orders and history
labels: frontend
estimate: 2 days

**Context:** Same jank risk as approvals (#570) applies to orders/transaction-history lists that grow unboundedly. Share the virtualization utility rather than fork it.

**Tasks:**
- [ ] Extract `useVirtualList` from #570's implementation (or introduce together — sequencing note) and adopt in orders list and decision history (#568)
- [ ] Variable-height rows supported (wrapped text); scroll anchoring stable across data refreshes
- [ ] Measure before/after: DOM nodes and long-scroll FPS captured in PR (perf evidence norm)

**Acceptance criteria:**
- [ ] 5k-row fixture scrolls smoothly; memory profile flat over repeated traversals
- [ ] Refresh/insertions preserve viewport position (anchoring tests)
- [ ] Utility lives in packages/ui or shared hooks — single implementation, three consumers

---

### Link-prefetch strategy tuning
labels: frontend
estimate: 1 day

**Context:** Next.js default prefetching on viewport can waste bandwidth on heavy grids; conversely, critical paths (approvals ← notifications) benefit from aggressive prefetch. No strategy is deliberately chosen today.

**Tasks:**
- [ ] Audit all `Link` usages: set explicit prefetch policies (none for heavy/rare, viewport for nav, hover+intent for approval deep-links)
- [ ] Measure route-transition p95 before/after using #512 vitals instrumentation (open — coordinate; if unavailable, temporary local measurement script)
- [ ] Document the policy matrix (route → policy + rationale) as the convention

**Acceptance criteria:**
- [ ] Policy matrix committed; deviations require justification comment
- [ ] Transition p95 improved-or-neutral with reduced wasted prefetch bytes (numbers attached)
- [ ] No prefetch storms on list pages (network log evidence)

---

### Remote-image pipeline audit (next/image adoption)
labels: frontend
estimate: 1 day

**Context:** Item images come from arbitrary merchant sources; raw `<img>` invites layout shift, bandwidth abuse, and mixed-content issues. next/image is configured (#395 domain whitelist) but adoption is inconsistent.

**Tasks:**
- [ ] Inventory every remote-image call site; convert to next/image with explicit dimensions or aspect-ratio wrappers; add blur placeholders where cheap
- [ ] Unknown-host resilience: onError fallback tile (branded, dimension-stable) so one bad merchant CDN never breaks a list
- [ ] Confirm optimizer settings sane for self-hosted deploy (or document unoptimized rationale)

**Acceptance criteria:**
- [ ] CLS contribution from images eliminated (vitals/lighthouse before-after attached)
- [ ] Broken-image fallback exercised in tests; no cumulative layout shift on late loads
- [ ] Domain-whitelist additions documented (security-reviewed list)

---

### Network-aware reduced-data mode
labels: frontend
estimate: 2 days

**Context:** Field users on metered/slow connections (global expansion, Phase 4) get full-fat media and charts regardless. `navigator.connection` hints enable graceful degradation.

**Tasks:**
- [ ] Detect save-data header / effective-type; expose `useDataSaver()` (manual override in settings persists)
- [ ] Reduced mode: images → placeholders until tapped, charts defer to summary numbers, autoplaying nothing, prefetch (#621) suppressed
- [ ] Indicator chip when active; respects per-page escape hatch ("load images anyway")

**Acceptance criteria:**
- [ ] Simulated 2G profile shows materially lighter page weight (har comparison attached)
- [ ] Manual override wins over heuristics; state survives reload
- [ ] Placeholder interactions accessible (keyboard+tap targets, alt text preserved)

---

### CI bundle-size gate
labels: frontend
estimate: 1 day

**Context:** #512 (open) defines the budget and a local script; nothing *enforces* it on PRs, so creep lands silently.

**Tasks:**
- [ ] `size-limit` (or equivalent) config per route-entry: initial JS budgets aligned to #512's documented numbers (+10% grace while debt tickets exist)
- [ ] CI job posts size table + delta comment on PRs; failing budget blocks merge (required check per #555's hygiene, open)
- [ ] Budget-bump procedure documented (requires justification link in PR description)

**Acceptance criteria:**
- [ ] Synthetic +30KB change demonstrably fails the check with readable report
- [ ] Baseline recorded; dashboard-worthy table in job summary
- [ ] Explicit dependency-note: builds on #512 outputs, no duplication of budget definitions (single source imported)

---

### Streaming Suspense for dashboard widgets
labels: frontend
estimate: 1 day

**Context:** Dashboard cards wait for the slowest query before painting together. Independent widgets should stream in as their data resolves.

**Tasks:**
- [ ] Wrap independent dashboard/analytics widgets in Suspense boundaries with skeleton fallbacks (existing skeletons restyled to widget size)
- [ ] Server-components where trivially convertible; otherwise client Suspense with startTransition fetches
- [ ] Pair with #569 boundaries so slow ≠ broken and error ≠ blank (composition documented)

**Acceptance criteria:**
- [ ] Artificially delayed widget streams in last without blocking siblings (timed test)
- [ ] Skeleton↔content swap causes no CLS (reserved dimensions)
- [ ] Composition matrix (Suspense×ErrorBoundary) documented for future widgets

---

### Service-worker update prompt UX
labels: frontend
estimate: 1 day

**Context:** PWA updates currently swap silently whenever the browser decides — users mid-task can lose client state to a surprise reload, and never know new features shipped.

**Tasks:**
- [ ] Detect waiting SW via `usePwaInstall`-adjacent registration APIs; show non-blocking toast (#541 system, open): "New version ready — Reload" with dismiss (deferred until next natural navigation)
- [ ] Auto-apply on idle navigation when deferred; changelog snippet (feeds from #545 announcement data) in the toast body
- [ ] Hard-cap deferral (7 days) with clearer urgency copy

**Acceptance criteria:**
- [ ] Waiting→activated transitions covered in tests (mocked registration states)
- [ ] No reload ever occurs while a modal/drawer is open (guard asserted)
- [ ] Deferred updates eventually apply (timer logic tested incl. tab-sleep quirks documented)

---

## I. Quality, Testing & Devx

### Schema-drift contract tests for SDK fixtures
labels: frontend, area/testing
estimate: 2 days

**Context:** `@delegolabs/sdk`/`types` evolve independently; frontend fixtures (MSW scenarios, test factories) rot silently until runtime explosions. CI should scream at drift.

**Tasks:**
- [ ] Generate zod schemas (zod already a dependency) from `@delegolabs/types` for every entity the app consumes; validate all MSW fixtures + factories against them in a dedicated CI job
- [ ] Failure report lists offending fixture paths + expected-vs-actual shape diffs
- [ ] Version-pin check: upgrading SDK types in a PR automatically re-runs the suite (natural via lockfile, documented)

**Acceptance criteria:**
- [ ] Deliberately breaking a fixture fails CI with actionable diff (demo run linked)
- [ ] Suite runtime <30s; cached between runs when inputs unchanged
- [ ] Fixtures single-sourced (no duplicate literal objects across test files — lint-assisted)

---

### jest-axe unit gates for every @delegolabs/ui component
labels: frontend, area/testing
estimate: 1 day

**Context:** E2E-level axe scanning exists (deps present), but component-level violations are cheapest to catch at birth in the package's own vitest suites.

**Tasks:**
- [ ] Add `vitest-axe` (jest-axe flavor) assertions to all existing component tests (Button, Card, FormField, StroopsInput, Badge, ActivityTimeline) and mandate in the contribution checklist for new components
- [ ] Cover interaction states too (focus-visible, aria-expanded on future Menu/Accordion, error-state FormField)
- [ ] Zero-violation baseline established; new violations fail CI with element-scoped diffs

**Acceptance criteria:**
- [ ] Every exported component's suite includes axe assertions (coverage list in PR)
- [ ] Introduced violation demonstrably fails (red-green demo)
- [ ] Runtime cost negligible (<2x suite time)

---

### Coverage gate for packages/ui (≥90% lines+branches)
labels: frontend, area/testing
estimate: 1 day

**Context:** App hooks got a coverage gate (#554 era); the design-system package — the highest-reuse code — has thresholds nowhere enforced.

**Tasks:**
- [ ] Configure `@vitest/coverage-v8` thresholds for packages/ui: 90% lines/branches/functions, 100% for pure presentational components where achievable
- [ ] Fill gaps found en route (likely ActivityTimeline variants, Badge tone matrix) — tests, not `istanbul ignore` (bans ignores in config)
- [ ] Publish coverage artifact per PR with diff commentary (patch coverage highlighted)

**Acceptance criteria:**
- [ ] Gate green and enforced; ignore-directives banned via config (verified by attempting one)
- [ ] Patch-coverage comment appears on PRs touching packages/ui
- [ ] Suite stays <60s locally

---

### Nightly full-suite run with flake quarantine
labels: frontend, area/testing
estimate: 2 days

**Context:** PR CI must stay fast; slow/flaky tests either block merges or get skipped into oblivion. A nightly cadence with quarantine labeling fixes the incentive structure.

**Tasks:**
- [ ] Nightly scheduled workflow: full unit + E2E matrix (desktop/mobile, both themes) with retry-once + flake detection (pass-on-retry ⇒ flagged)
- [ ] `quarantine/` label automation: flakes auto-labeled with issue creation attaching traces/videos; quarantine list enforced (quarantined tests excluded from PR gate but MUST be fixed or deleted within 14 days — expiry bot re-enables)
- [ ] Weekly flake-report digest as an issue for triage rotation

**Acceptance criteria:**
- [ ] Injected flake (chaos test) follows the whole pipeline: detect → label → issue → expiry re-enable
- [ ] PR CI wall-time unchanged or better; nightly artifacts retained 14d
- [ ] Runbook doc for triage rotation committed

---

### Seeded demo dataset script (`pnpm seed:demo`)
labels: frontend, area/testing
estimate: 1 day

**Context:** Manual QA and screenshots need realistic state (varied delegations, orders mid-fulfillment, disputes, notifications); every contributor hand-crafts scraps today. MSW fixtures (#552, open) provide the vocabulary.

**Tasks:**
- [ ] Deterministic seeded generator producing a coherent world: 3 agents, 6 delegations across lifecycle stages, 40 orders spread over 60 days, escrows in each state, notifications, one dispute
- [ ] Modes: `--mock` (boots dev server against MSW with the world) and `--export` (JSON snapshots consumable by tests/storybook decorators)
- [ ] README recipe: one-command reproducible demo for screenshots and stakeholder walkthroughs

**Acceptance criteria:**
- [ ] Two fresh runs produce byte-identical exports (determinism asserted)
- [ ] World exercises every UI state class referenced by empty/loading/error matrices
- [ ] Consumed by at least one existing test suite to prove interop (wiring shown)

---

### Read-only demo/sandbox mode
labels: frontend
estimate: 2 days

**Context:** Stakeholders and hackathon judges should explore the real UI without wallets, funds, or backend access. Distinct from seeding (#631): this is a *mode*, not data.

**Tasks:**
- [ ] Flag-gated demo mode: boots against MSW fixtures (read-world from #631), injects a synthetic connected-wallet state, banners "Demo — no real funds" persistently
- [ ] All mutating CTAs render disabled-with-explanation tooltips; routing guards prevent write attempts at the client layer (defense-in-depth note: server remains authoritative)
- [ ] Entry via `/demo` route (shareable) that sets the flag for the session

**Acceptance criteria:**
- [ ] Full click-through journey possible with zero backend/env config (fresh-clone instructions verified)
- [ ] Mutation attempts impossible from UI surfaces (attempt-handler tests)
- [ ] Demo banner unmissable yet unobtrusive; exits cleanly in normal mode

---

### Generate API client types from gateway OpenAPI
labels: frontend
estimate: 3 days

**Context:** Gateway exposes an OpenAPI spec (#352/#466 lineage). Frontend call sites hand-roll payload shapes today — drift waits to happen. Codegen closes the loop with the published packages.

**Tasks:**
- [ ] Pipeline: pull spec (versioned artifact) → `openapi-typescript` client + types into a workspace package (`@delegolabs/api-generated`) → thin adapter aligning to existing call sites
- [ ] Adopt incrementally: migrate one module (approvals) as the pattern; remainder ticketed with owners
- [ ] CI check: spec hash change without regenerated client fails with instructions

**Acceptance criteria:**
- [ ] Approvals module fully typed end-to-end from spec (no hand-written interfaces remain there)
- [ ] Regeneration is one command, deterministic, diff-reviewable
- [ ] Drift CI check demonstrated red on stale client

---

### Import-boundary lint rules (feature isolation)
labels: frontend
estimate: 1 day

**Context:** As features grow (components/* by domain), cross-feature imports creep: orders components reaching into escrows internals, etc. Boundaries keep features extractable (monorepo → future packages).

**Tasks:**
- [ ] eslint-plugin-import (or boundaries equivalent) rules: `components/<feature>/**` may not import sibling features' internals; shared only via `packages/ui`, `lib`, and feature `public.ts` barrels
- [ ] Create barrels where needed; fix violations en route (mechanical moves, no logic edits)
- [ ] Document the architecture rule with a diagram in `apps/frontend/components/README.md`

**Acceptance criteria:**
- [ ] Deliberate cross-feature import fails lint with helpful message (demo)
- [ ] Existing tree passes clean (violations fixed or explicitly waived with justification comments)
- [ ] Rule performance impact on lint time negligible (measured)

---

### Task-output caching for CI speed (local+remote)
labels: frontend
estimate: 2 days

**Context:** CI rebuilds/typechecks everything per job (five jobs × cold installs). Turborepo-style caching slashes wall-time and compute cost as the repo grows.

**Tasks:**
- [ ] Introduce turbo (or Nx-lite equivalent — justify pick) wrapping build/typecheck/lint/test pipelines with content hashing; wire GitHub Actions cache backend (remote cache via actions, no paid service initially)
- [ ] Correctness first: pipeline graph expresses dependencies (ui build before web typecheck) — eliminate order-by-luck
- [ ] Metrics: job minutes before/after captured; target ≥40% reduction on typical PR

**Acceptance criteria:**
- [ ] Second run of unchanged tree is cache-hit dominated (logs demonstrate)
- [ ] Forced-cache-miss correctness check (touch a deep file → exactly downstream tasks rerun)
- [ ] Docs: local parity (`pnpm turbo build` mirrors CI behavior)

---

### Renovate with safety-automerge policy
labels: frontend
estimate: 1 day

**Context:** Dependencies drift manually; the axios override in root package.json hints at past firefights. Automation with guardrails beats both neglect and blind bumps.

**Tasks:**
- [ ] renovate.json: grouped minor/patch weekly, majors separate-and-labeled, automerge for patch devDeps passing full CI; lockfile maintenance cadence
- [ ] Protected zones: react/next majors require human + migration-notes issue template; `@delegolabs/*` internal packages pinned to released tags with explicit bump PRs
- [ ] Vulnerability alerts route as high-priority (override grouping) with same CI gates

**Acceptance criteria:**
- [ ] Dry-run config validated (renovate CLI) with sample PR preview attached
- [ ] Automerge only when CI green (branch protection interplay documented)
- [ ] Onboarding doc: what maintainers must review vs what merges itself

---

## J. Content, A11y & Polish

### First-run guided tour (coach marks)
labels: frontend
estimate: 2 days

**Context:** Onboarding flow shipped (checklist wave) — task-oriented. A spotlight tour teaches *layout* (where approvals live, what the network badge means) for first-session orientation. Sequenced after wizard (#523, open) lands its final IA.

**Tasks:**
- [ ] Lightweight tour engine (no dep): spotlight overlay + step definitions anchored to elements, scroll-into-view, resilient to missing anchors (skip step)
- [ ] Tour: home → wallet/network badge → delegations → approvals inbox → where help lives; skippable anytime (persist dismissal), re-launchable from Help
- [ ] Steps content-owned in one config file (copy-editable without code archaeology)

**Acceptance criteria:**
- [ ] Tour survives route changes mid-flow (pauses/resumes sanely) and never traps keyboard users (Esc exits, focus managed via existing trap hook)
- [ ] Missing-anchor steps skip gracefully (DOM-change simulation test)
- [ ] Completion/dismissal persisted; replays never nag

---

### Contextual help links to docs
labels: frontend
estimate: 1 day

**Context:** Escrow mechanics, delegation limits, dispute flows — concepts users haven't met before. Inline "?" affordances beat hunting docs; docs already live in-repo (`docs/`).

**Tasks:**
- [ ] `HelpLink` component (tooltip on hover/focus, external-link treatment) mapping concept → canonical doc anchor (escrow → system-design section, limits → permissions docs…)
- [ ] Place at: limit editors, escrow detail header, dispute intro, network switcher, privacy center
- [ ] Links target the deployed docs site URL base from env with local-dev fallback to repo paths

**Acceptance criteria:**
- [ ] Anchor map centralized (single config; dead-link check script or CI linkinator job scoped to mapped URLs)
- [ ] Tooltips keyboard-accessible and dismissible (WCAG pattern)
- [ ] Placement list reviewed for restraint (help where confusion is measured/likely, not confetti)

---

### Scheduled dark-mode auto-switch
labels: frontend
estimate: 1 day

**Context:** Theme toggle + system-follow shipped; night-owl users want automatic sunset/sunrise switching without system-wide commitment.

**Tasks:**
- [ ] Third theme mode "Scheduled": geolocation-free solar estimate is overkill — offer fixed local-time range (default 19:00–07:00) with minute precision; evaluate on interval + wake-from-sleep (visibilitychange re-check)
- [ ] Mode joins the existing theme store (light/dark/system/scheduled) with seamless pre-hydration bootstrap extension
- [ ] Transitions honor reduced-motion; crossfade kept subtle

**Acceptance criteria:**
- [ ] Boundary crossing flips theme within a minute of scheduled time (fake-timer tests)
- [ ] Sleep/wake re-evaluation verified (visibilitychange simulation)
- [ ] Bootstrap script extension stays flash-free (reload matrix across modes)

---

### Microcopy consistency pass + voice guide
labels: frontend
estimate: 1 day

**Context:** Strings accumulated from many contributors: "Could not read wallet address" vs "Unable to load balance" vs error-toned caps. Inconsistent voice erodes product trust subliminally.

**Tasks:**
- [ ] Author `docs/frontend-voice.md`: tone principles, verb/noun conventions (Retry vs Try again), error-message formula (what happened + what to do), capitalization/punctuation rules
- [ ] Sweep user-visible strings against the guide (i18n catalogs as source of truth); normalize offenders; list judgment calls for review
- [ ] Add a linting aid: terminology checklist script (flags banned phrases like "oops", "sorry", exclamation spam) runnable in CI as warnings

**Acceptance criteria:**
- [ ] Guide merged with examples from real strings (before/after table)
- [ ] Sweep inventory attached: every changed string + rationale; zero drive-by rewrites of logic
- [ ] Warning-level CI check green (or justified suppressions listed)

---

### Screen-reader UX audit execution (NVDA/VoiceOver)
labels: frontend
estimate: 2 days

**Context:** Automated axe (E2E deps present; unit gates via #628) catches markup violations, not *experience* problems: unlabeled state changes, announcement storms, illogical reading order in the wizard. Humans with real AT must drive the golden paths.

**Tasks:**
- [ ] Scripted AT walkthroughs (NVDA on Windows/Chrome, VoiceOver on macOS/Safari) of: connect → wizard → approval decision → dispute filing; log every confusion point with recording timestamps
- [ ] Fix class of issues found: missing/verbose announcements (aria-live vocab aligned with #557's plan), reading-order corrections, landmark/heading hygiene on dense pages
- [ ] Publish `docs/frontend-at-notes.md`: per-flow results, remaining known limitations, AT-version matrix

**Acceptance criteria:**
- [ ] All logged blockers fixed or ticketed with severity (zero unfixed criticals)
- [ ] Re-run after fixes shows clean pass on the scripted paths (recordings linked in PR)
- [ ] Findings feed concrete additions to #628 assertion list where automatable

---

## Suggested sequencing

1. **Trust chain first:** #585 (tx preview) → #591 (consent log) pair with the open #520 signing work.
2. **Money surfaces:** #575/060/061/062 form the escrow-financials cluster — land together after coordinating getter/proxy shapes.
3. **Offline arc:** #619 → #618 → #626 completes the PWA story started by closed batch-1 work.
4. **Quality bedrock:** #627/115 unblock confident refactors; #633's codegen should precede any large API-module rewrite.
5. Groups D/E/F/G are largely independent — good parallel-contribution lanes.
