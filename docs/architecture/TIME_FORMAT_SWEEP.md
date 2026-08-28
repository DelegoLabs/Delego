# Timezone / clock-format call-site sweep (#608)

`useTimeFormat()` (`hooks/useTimeFormat.tsx`) and the preference-aware
helpers in `lib/intl.ts` (`formatDateTimeWithPreferences`,
`formatTimeWithPreferences`, `formatFullDateTimeWithPreferences`,
`formatRelativeTime`) exist so date/time display can honor a user's chosen
timezone, 12h/24h clock format, and (for future calendar UI) first day of
week, instead of only ever using the browser's default timezone via a bare
`toLocaleString()`/`toLocaleDateString()` call.

This is a full repo-wide inventory of every call site that formats a `Date`
for display, split into **converted** (this PR) and **not yet converted**
(follow-up), per #608's "enumerate conversions in PR" acceptance criterion.
Numeric `.toLocaleString()` calls that format plain numbers, not dates
(`AssetBreakdownTable.tsx`, `BalanceSparkline.tsx` — both format a `balance`
number) are not date/time call sites and are excluded from this list.

## Converted in this PR

| File | What changed |
| --- | --- |
| `components/notifications/NotificationCenter.tsx` | Local `formatRelativeTime` (duplicate ad-hoc implementation) replaced with the shared `lib/intl.ts` version. |
| `components/orders/ApprovalCard.tsx` | "Requested" timestamp: `formatDateTime` → `formatDateTimeWithPreferences`. |
| `components/escrows/CancelGraceBanner.tsx` | Undo-deadline time: `formatDateTime` → `formatTimeWithPreferences`. This is the highest-value conversion in the sweep — a wrong timezone here could make a user think they still have time to undo a cancellation when they don't. |
| `components/orders/OrderTable.tsx` | Row "Created" date: local `formatDate` (no locale, no timezone control) → `formatDateTimeWithPreferences`. |

## Not yet converted (follow-up)

Listed with the exact call site and a one-line note on priority. None of
these are wrong today — they use the browser's default timezone, which is
correct for a user who hasn't changed their timezone preference from "auto"
— but none of them will honor a *non-default* timezone or clock-format
choice until converted.

| File : line | Displays | Priority note |
| --- | --- | --- |
| `components/orders/ReceiptPanel.tsx:21` | Order receipt timestamp | High — a receipt is exactly the kind of record a cross-border user would want in their own timezone. |
| `components/orders/ApprovalAgeBadge.tsx:34` | "Waiting since" tooltip on an approval | Medium — tooltip only, not the primary display. |
| `components/orders/ApprovalDrawer.tsx:145,153` | Dual-control first/second approval timestamps | Medium — audit-trail display. |
| `components/orders/OrderTrackingCard.tsx:14` | Tracking event timestamp | Medium. |
| `app/tracking/page.tsx:14` | Tracking event timestamp (page-level, likely shares logic with OrderTrackingCard) | Medium. |
| `components/escrows/EscrowCard.tsx:205` | Escrow creation date | Medium. |
| `components/escrows/EscrowCountdown.tsx:58` | Escrow original deadline | High — same "could mislead about a deadline" concern as the CancelGraceBanner conversion above. |
| `components/escrows/ExtensionModal.tsx:100` | Proposed new escrow deadline | High — same deadline concern. |
| `components/delegations/wizard/WizardStepReview.tsx:14` | Delegation expiry date shown during setup | Medium. |
| `components/delegations/LimitUsageBar.tsx:396-397` | Spending-limit-reset entry timestamps | Low — historical log entries. |
| `components/settings/JournalViewer.tsx:196` | Consent-journal entry timestamp | Low — historical log entries. |
| `app/offline/page.tsx:43` | "Saved" timestamp for a cached offline read | Low. |
| `app/wallet/page.tsx:138` | *Not a date* — `nativeBalanceNum.toLocaleString()` formats a number; flagged here only because it matched the sweep grep, no action needed. |

`lib/analytics.ts` and `lib/quietHours.ts` also construct
`Intl.DateTimeFormat` instances, but for internal day-bucketing / quiet-hours
scheduling logic rather than user-facing display — out of scope for this
sweep, which covers only what a user *reads*.

## Converting a remaining call site

1. Import `useTimeFormat` from `hooks/useTimeFormat` and the relevant helper
   from `lib/intl.ts` (`formatDateTimeWithPreferences` for date+time,
   `formatTimeWithPreferences` for time-only, `formatFullDateTimeWithPreferences`
   for both with the library's default styling).
2. Replace the ad-hoc `toLocaleString()`/`toLocaleDateString()` call (or the
   locale-only `formatDate`/`formatDateTime` from `lib/intl.ts`) with the
   `WithPreferences` equivalent, passing `preferences` from `useTimeFormat()`.
3. If the component's tests mock hooks wholesale (grep the test file for
   `vi.mock("../../hooks/...")`), add a `useTimeFormat` mock alongside the
   others rather than wrapping in a real `TimeFormatProvider` — see
   `components/orders/ApprovalCard.test.tsx` for the pattern. If the test
   file already wraps in real providers (e.g. `NextIntlClientProvider`), wrap
   in a real `TimeFormatProvider` too instead — see
   `components/escrows/CancelGraceBanner.test.tsx`.
4. Move the row from "Not yet converted" to "Converted" in this doc.
