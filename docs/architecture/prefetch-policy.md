# Link prefetch policy

Next.js's `<Link>` prefetches its target on viewport entry by default. That's
free performance for a small, always-visible set of destinations, but wasted
bandwidth when the same behavior fires once per row in a long list — and a
real prefetch storm once a list is long enough that many rows enter the
viewport at once (#621).

Every `<Link>` in `apps/frontend` sets an explicit `prefetch` value (or uses
`HoverPrefetchLink`, see below) rather than relying on the implicit default,
so the policy is visible at the call site instead of being an accident of
whichever value Next.js happens to default to.

## The three policies

| Policy | Mechanism | When |
| --- | --- | --- |
| **viewport** | `<Link prefetch={true}>` | A small, fixed set of destinations that are likely to be visited and cheap to prefetch — primary navigation, single "back" links on detail pages. |
| **none** | `<Link prefetch={false}>` | Rare, dismissible, or externally-driven links where most impressions never result in a click — e.g. an announcement banner most users dismiss without reading. |
| **hover+intent** | `<HoverPrefetchLink>` (`components/layout/HoverPrefetchLink.tsx`) | Links repeated per-row in a list or grid (table rows, cards) — including approval deep-links reached from the notification panel — where viewport prefetch would fire for every visible row simultaneously. Prefetches only after a 100ms hover delay (so a pointer passing over several rows doesn't trigger one fetch per row) or immediately on keyboard focus. |

`HoverPrefetchLink` exists because Next's own `prefetch` prop can't express
"hover, not viewport" — passing `prefetch={false}` disables prefetch **even
on hover** (see the prop's own JSDoc in `next/link`'s type definitions), so
hover-intent prefetch has to be done by hand via `router.prefetch()`.

## Current policy matrix

| Route / component | Policy | Rationale |
| --- | --- | --- |
| `components/layout/Sidebar.tsx` (primary nav) | viewport | Small fixed set, always visible, near-certain to be used. |
| `components/layout/MobileNav.tsx` (primary nav) | viewport | Same as Sidebar — the mobile equivalent. |
| `app/not-found.tsx` ("Go Home") | viewport | Single link, trivial cost. |
| `app/escrows/[id]/page.tsx` ("Back to Escrows", ×2: not-found and detail states) | viewport | Single link per render, likely to be clicked leaving a detail page. |
| `app/delegations/[id]/page.tsx` ("Back to Delegations", ×2) | viewport | Same reasoning as the escrow detail page. |
| `app/orders/[id]/page.tsx` ("Back to Transaction History", ×2) | viewport | Same reasoning as the escrow detail page. |
| `components/announcements/AnnouncementBanner.tsx` ("Learn more") | none | Most announcements are dismissed unread; the link target is also externally/content-driven, not a route we control the cost of. |
| `components/orders/OrderTable.tsx` (order id → receipt) | hover+intent | Repeated per table row; a table can have many rows on screen at once. |
| `components/delegations/DelegationCard.tsx` ("View detail") | hover+intent | Repeated per card in a grid. |
| `components/notifications/NotificationCenter.tsx` (notification item, stack "View detail") | hover+intent | The approval-deep-link case from #621's own example — repeated per notification, and the panel can list many. |

Any new `<Link>` should pick one of these three explicitly. A link that
doesn't fit one of the rationales above needs its own justification comment
at the call site, per #621's acceptance criteria.

## Measurement

#621 also asks for before/after route-transition p95 numbers, coordinated
with the existing Web Vitals instrumentation
(`components/providers/WebVitalsReporter.tsx`, see
[`frontend-perf.md`](./frontend-perf.md)). That reporter measures Core Web
Vitals (LCP/CLS/INP/FCP/TTFB) for full page loads; App Router client-side
route transitions don't refire those same signals, so it doesn't directly
answer "did this change make in-app navigation faster." Producing a real
before/after comparison needs a small purpose-built measurement (e.g. a
Playwright script recording `performance.mark`s around `router.push()` calls
against both a stashed pre-#621 build and this one) — **not implemented in
this PR**. Flagged here as follow-up work rather than shipped with numbers
that weren't actually measured.
