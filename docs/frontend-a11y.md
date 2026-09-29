# Frontend accessibility conventions

Conventions for keyboard access, focus management, and screen-reader
announcements in `apps/frontend`. Builds on the foundational work already
shipped: focus-visible styles, `prefers-reduced-motion` support, and semantic
landmarks (see `apps/frontend/styles/globals.css`).

## Modal / drawer / popover pattern

Every overlay that traps user attention (`MobileNav`, `NotificationCenter`,
`ApprovalDrawer`, `DisputeResponseDrawer`, and any future dialog) must:

1. Render with `role="dialog"` and `aria-modal="true"`, plus an
   `aria-label` or `aria-labelledby` naming the overlay. Exactly one element
   carries the role — put it on the panel, not on a wrapper that also contains
   the backdrop.
2. Use [`useFocusTrap`](../apps/frontend/hooks/useFocusTrap.ts) to move
   initial focus into the overlay on open, cycle Tab/Shift+Tab within it,
   and restore focus to the triggering element on close.
3. Close on `Escape` — pass `onEscape` to the trap rather than adding a
   separate `document` keydown listener (see `MobileNav` for the
   outside-click/Escape handling in `NotificationBell`, which closes a popover
   anchored to a trigger button).
4. Lock body scroll while open if the overlay covers the viewport (see
   `MobileNav`).

`useFocusTrap({ containerRef, isActive, onEscape })` is the shared primitive —
pass a ref to the dialog/panel element, whether it's currently open, and
optionally a close callback. It no-ops when `isActive` is `false`, so it's safe
to call unconditionally in components that render their panel conditionally
(`NotificationCenter`, mounted only while open) or keep it always mounted and
toggle visibility (`MobileNav`).

The trap owns every `Tab` keypress rather than only the ones at the edges of
its cycle, because the browser's sequential focus order is document-wide: a
positive `tabindex` on background content sorts ahead of the drawer's own
controls and would otherwise pull focus onto the page behind the backdrop.
Elements removed from the accessibility tree (`[hidden]`, `aria-hidden`,
`inert`, `visibility: hidden`, disabled form controls) are excluded from the
cycle, so focus never lands where the user cannot see it.

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

## Streaming agent messages

`useAnnounce` is for discrete events. It must **not** be used for streamed
agent text: feeding it every token makes the live region change dozens of
times per second, and NVDA/JAWS/ VoiceOver respond by abandoning whatever
they are speaking and restarting. A long agent reply is heard as a series of
clipped fragments, which is the failure reported in #772.

Use [`useStreamingAnnouncer`](../apps/frontend/hooks/useStreamingAnnouncer.tsx)
instead. It buffers tokens and exposes only the sentences that are safe to
speak:

```tsx
const { announcement, appendToken, flush, announceNow, isStreaming } =
  useStreamingAnnouncer();

for await (const token of stream) appendToken(token);
flush(); // announces any trailing partial sentence

return <StreamingAnnouncerRegion announcement={announcement} />;
```

How it satisfies the acceptance criteria:

- **Only complete sentences are announced.** Partial text stays buffered, so a
  clause is never spoken before it is finished.
- **Sentences are paced.** Each completed sentence is held for
  `DEFAULT_ANNOUNCE_INTERVAL_MS` (700ms — roughly one sentence of comfortable
  speech) before the next is published, so announcements queue behind the
  reader instead of cutting it off. The queue is capped at 20; overflow drops
  the oldest, which is what the reader would have skipped anyway.
- **Boundary detection is not naive.** `streamingSentences.ts` declines to
  split on decimals (`3.5 XLM`), abbreviations (`Dr.`, `Acme Inc.`), initials
  (`J. R. Doyle`), or a period followed by a lowercase word. A reply with no
  punctuation at all is force-split at 320 characters so it still gets spoken.
- **Discrete UI events bypass the buffer.** `announceNow("Proposal ready to
  review.")` is for things that are not part of the spoken text — a proposal
  card appearing, a checkout action becoming available.

Two rules for the live region itself:

1. **Mount it empty and leave it mounted.** Screen readers ignore a live
   region inserted into the DOM at the same moment its content appears. The
   hook's first publish is delayed by a blank pass for exactly this reason.
2. **`aria-atomic` is `true` and `aria-relevant` is `additions text`** because
   the region holds exactly one sentence at a time. Accumulating every
   sentence into one log with `aria-atomic="false"` — the approach originally
   sketched in #772 — only works if the reader finishes each utterance before
   the next arrives, which cannot be guaranteed. Publishing discrete,
   fully-spoken sentences into an atomic region behaves consistently across
   NVDA, JAWS and VoiceOver.

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

