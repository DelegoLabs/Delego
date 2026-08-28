# Dashboard widget composition (Suspense × ErrorBoundary)

Independent analytics/dashboard widgets must **never wait for the slowest
sibling**. Wrap each widget in `WidgetBoundary` (`apps/frontend/components/dashboard/WidgetBoundary.tsx`).

That component is the composition of two React primitives:

| Layer | Primitive | When the child is… | What the user sees |
| --- | --- | --- | --- |
| Outer | `WidgetErrorBoundary` | **thrown** | This widget's error card + Retry. Siblings keep their content. |
| Inner | `Suspense` | **pending** | This widget's skeleton, sized to `minHeight`. Siblings keep painting. |
| Inner | `Suspense` | **resolved** | The widget content, in a box with the **same** `minHeight` (no CLS). |

```
slow ≠ broken     a pending fetch does not look like an error
error ≠ blank     a thrown fetch does not unmount the page
```

## Adding a widget

```tsx
import { WidgetBoundary } from "../dashboard/WidgetBoundary";

<WidgetBoundary name="Spending overview" minHeight="12rem">
  <SpendingOverviewWidget />
</WidgetBoundary>
```

The child should either:

1. Be a Server Component that `await`s its own data, or
2. Be a Client Component that `use()`s a per-widget promise from
   `getResource()` (`lib/suspenseResource.ts`) so it suspends independently.
   Use `startTransition` when swapping the resource key (e.g. a range
   change) so the previous UI stays up instead of flashing the skeleton.

Do **not** lift `loading` flags to the page and gate the whole dashboard on
`loadingA \|\| loadingB` — that is the anti-pattern this issue removed.

## Reserved dimensions

`minHeight` is applied to **both** the skeleton fallback and the content
wrapper. Pick a value that matches the rendered widget (chart: `20rem`,
stat grid: `12rem`, table: `16rem`). A skeleton↔content swap with matching
heights produces no cumulative layout shift.

## Error vs. slow

| Situation | Boundary that handles it | Sibling widgets |
| --- | --- | --- |
| Fetcher still pending | `Suspense` → skeleton | Unaffected |
| Fetcher throws / `use()` rejects | `WidgetErrorBoundary` → error card | Unaffected |
| Page-level crash | `app/error.tsx` | Whole segment |
