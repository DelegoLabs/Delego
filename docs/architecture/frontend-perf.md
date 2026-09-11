# Frontend performance budget

Runtime Web Vitals (LCP, CLS, INP, FCP, TTFB) are measured via
`next/web-vitals` in `components/providers/WebVitalsReporter.tsx` (#512) — in
dev they're logged to the browser console; in production they're sent as
Sentry measurements (reusing the [Sentry integration](../../apps/frontend/sentry.client.config.ts)
from #511) and, if `NEXT_PUBLIC_WEB_VITALS_ENDPOINT` is set, beaconed to that
endpoint too.

## Budget

| Metric                    | Budget                          |
| -------------------------- | -------------------------------- |
| Initial route First Load JS | < 250 KB gzipped                |
| LCP (Largest Contentful Paint) | < 2.5s on mid-tier mobile     |
| INP (Interaction to Next Paint) | < 200ms                     |
| CLS (Cumulative Layout Shift)   | < 0.1                        |
| TTFB (Time to First Byte)       | < 800ms                      |

These thresholds follow the ["good"](https://web.dev/articles/vitals) Core
Web Vitals cutoffs for LCP/INP/CLS. "Mid-tier mobile" means a throttled
profile roughly equivalent to Lighthouse's default mobile simulation
(4x CPU slowdown, Slow 4G).

## Enforcing the JS budget locally

```bash
pnpm --filter @delegolabs/web check:perf-budget
```

This runs a production build and fails if any route's First Load JS exceeds
250KB, parsing the per-route size table `next build` already prints. For a
visual breakdown of what's contributing to a route's bundle, run:

```bash
pnpm --filter @delegolabs/web analyze
```

which opens the `@next/bundle-analyzer` treemap (already configured in
`next.config.ts`).

## What counts against the budget

The "First Load JS" number for a route is the JS a fresh visitor to that
route must download and parse before the page is interactive — shared chunks
(React, the app shell, `@delegolabs/ui`) plus that route's own code. Moving
a heavy, rarely-used dependency (e.g. `qrcode`, `recharts`) behind a dynamic
`import()` — as `DelegationQR` already does — keeps it out of this number
until the feature that needs it actually renders.

## When a route goes over budget

1. Run `pnpm analyze` and look at which chunk grew.
2. Prefer `next/dynamic` for anything not needed for the initial paint.
3. Check for an accidental non-tree-shakeable import (e.g. importing a whole
   utility library for one function).
4. If the growth is justified (a genuinely new, load-bearing dependency),
   raise the budget deliberately in this doc alongside the PR, rather than
   letting `check:perf-budget` silently start failing for everyone.
