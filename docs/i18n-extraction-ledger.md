# i18n string extraction ledger

Tracks what's extracted into `messages/en.json` under the FE-049 i18n
scaffolding work, and what's still hardcoded English pending follow-up PRs.

## Extracted (namespaced, translatable)

- `app.*` — brand name, tagline
- `nav.*` — sidebar/mobile-nav labels, hamburger + close button aria-labels
- `common.*` — shared cancel/save/loading/error strings
- `forms.*` — shared form hint copy
- `delegations.wizard.*` — the delegation creation form (`DelegationForm`)
- `escrows.*` — page heading, description, search placeholder + aria-label,
  filter-by-status legend, status chip labels (Funded / Released / Refunded /
  Disputed), loading aria-label, error title + try-again, empty-state copy
  (`app/escrows/page.tsx`, `components/escrows/EscrowFilters.tsx`)
- `settings.language.*` — the language switcher stub

## Not yet extracted (hardcoded English)

Tracked here rather than in code TODOs so extraction work stays visible in
one place. Pull requests picking these up should link back to this ledger
and delete the corresponding line.

- `components/orders/ApprovalCard.tsx` — status/labels ("Pending approval",
  "High value", "Merchant", "Delegation", "Requested", reject reason prompt)
- `components/orders/OrderTable.tsx`, `OrderTrackingCard.tsx` — table
  headers, status labels
- `components/orders/StatusTimeline.tsx`, `OrderFilters.tsx`
- `components/escrows/EscrowCard.tsx` — status badge label, escrow detail strings
- `components/analytics/SpendingOverview.tsx`, `app/analytics/page.tsx`
- `components/settings/ProfileForm.tsx`, `PreferencesForm.tsx`
- `components/delegations/DelegationList.tsx`, `DelegationCard.tsx`,
  `DelegationQR.tsx`, `ExpiryCountdown.tsx`
- `components/wallet/*`, `app/wallet/page.tsx`
- `components/notifications/NotificationCenter.tsx`,
  `NotificationBell.tsx` — dialog copy, relative-time strings
  (`formatRelativeTime`)
- `components/search/GlobalSearch.tsx`
- `app/onboarding/*`, `app/tracking/*`
- `lib/orders.ts` `orderStatusLabel()` — derives labels from the status enum
  by string-casing rather than a lookup table; needs a `orderStatus.*`
  message namespace to translate
- Toast/notification title strings passed to `useNotifications().add()`
  wherever they're called (server-driven titles from #357 are already
  localized server-side; client-triggered ones are not)

## Notes for follow-up

- `lib/intl.ts` provides `formatDate`/`formatDateTime`/`formatNumber`
  helpers that take an explicit locale (from `useLocale()`); use them
  instead of bare `toLocaleString()` calls when extracting a component.
- `formatXlm()` in `lib/orders.ts` now takes an optional `locale` param —
  pass it from call sites that have `useLocale()` available.
- Run `pnpm --filter @delegolabs/web check:i18n` to see which
  `messages/de.json` keys are still missing relative to `en.json` (it warns
  in CI logs but doesn't fail the build — missing keys fall back to English).
