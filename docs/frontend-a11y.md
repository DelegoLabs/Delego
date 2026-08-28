# Frontend accessibility conventions

Conventions for keyboard access, focus management, and screen-reader
announcements in `apps/frontend`. Builds on the foundational work already
shipped: focus-visible styles, `prefers-reduced-motion` support, and semantic
landmarks (see `apps/frontend/styles/globals.css`).

## Modal / drawer / popover pattern

Every overlay that traps user attention (`MobileNav`, `NotificationCenter`,
and any future dialog) must:

1. Render with `role="dialog"` and `aria-modal="true"`, plus an
   `aria-label` or `aria-labelledby` naming the overlay.
2. Use [`useFocusTrap`](../apps/frontend/hooks/useFocusTrap.ts) to move
   initial focus into the overlay on open, cycle Tab/Shift+Tab within it,
   and restore focus to the triggering element on close.
3. Close on `Escape` (see `MobileNav`'s keydown handler, or the
   outside-click/Escape handling in `NotificationBell` for popovers anchored
   to a trigger button).
4. Lock body scroll while open if the overlay covers the viewport (see
   `MobileNav`).

`useFocusTrap(containerRef, active)` is the shared primitive — pass a ref to
the dialog/panel element and whether it's currently open. It no-ops when
`active` is `false`, so it's safe to call unconditionally in components that
render their panel conditionally (`NotificationCenter`, mounted only while
open) or keep it always mounted and toggle visibility (`MobileNav`).

## Announcement vocabulary

Async outcomes (approvals, rejections, notification arrivals, escrow
updates) must be announced to screen reader users via the shared
`useAnnounce` hook, not just shown visually.

```tsx
const { announce } = useAnnounce();
announce("Order approved.");           // aria-live="polite"
announce("Something failed.", "assertive"); // interrupts, use for errors
```

- **polite** (default): success/neutral outcomes — "Order approved.",
  "Notification: Escrow released."
- **assertive**: failures and errors — "Failed to approve order."

Message conventions:
- Start with the subject ("Order 123 approved.", not "Approved order 123.")
  so it reads naturally if truncated by assistive tech.
- Keep it one short sentence. No markup, no emoji (icons in the UI are
  already `aria-hidden`).
- Reuse the same wording that appears in the visible UI/toast where
  possible, so sighted and screen-reader users get the same information.

`useAnnounce` is provided app-wide by `AnnounceProvider` in
`AppProviders.tsx` and renders two `aria-live` regions (`polite` and
`assertive`), visually hidden via the `.sr-only` utility class.

## CI a11y gate

`apps/frontend/e2e/a11y.spec.ts` runs `@axe-core/playwright` against every
route that renders without an auth cookie (see `PUBLIC_ROUTES` in that
file). The `Accessibility Scan` CI job (`.github/workflows/ci.yml`) fails
the build on any **critical** or **serious** violation.

Routes gated behind `middleware.ts` (`/delegations`, `/orders`, `/wallet`,
`/settings`) aren't covered yet — they need the MSW API fixtures from
FE-045 to render real content instead of an auth redirect or empty
loading state. Add them to `PUBLIC_ROUTES` (and drop the auth-gate caveat)
once that fixture layer lands.

