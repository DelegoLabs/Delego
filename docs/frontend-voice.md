# Frontend voice guide

Tone and copy conventions for user-visible strings in `apps/frontend` and
`packages/ui`. Strings accumulate from many contributors over time —
without a shared reference, small inconsistencies ("Retry" vs. "Try
again", a terse fallback next to a helpful one) creep in even when no
individual string is wrong on its own.

## Tone principles

- **Calm, not alarmed.** Errors are a normal part of using the product,
  not a crisis. No exclamation points in error or status copy, no "Oops",
  no "Sorry" — state what happened and, where there's one, what to do
  next.
- **Specific over generic.** "Failed to create delegation" beats "Something
  went wrong" whenever the failure is known. Reserve `common.errorGeneric`
  ("Something went wrong. Please try again.") for genuinely unexpected
  failures — a caught exception with no more specific message available —
  not as a default first choice.
- **Second person, present tense** for instructions and hints ("Choose the
  language used throughout the app"), not passive voice ("The language used
  throughout the app can be chosen here").

## Verb and label conventions

| Situation                                    | Use                          | Not                        |
| --------------------------------------------- | ----------------------------- | --------------------------- |
| Retrying a failed action                     | `Try again`                  | `Retry`, `Reload`           |
| Dismissing a dialog/panel without saving      | `Cancel`                     | `Close` (reserve for non-destructive dismiss), `Discard` (reserve for confirmed-destructive actions) |
| A save operation in progress                 | `Saving…` (ellipsis, no dot) | `Please wait`, `Loading...` (three dots) |
| A field the user must fill in                | `Required`                   | `(required)`, `*` alone with no text equivalent |
| A field the user may skip                    | `Optional`                   | leaving it unmarked         |

These match `common.*` in `apps/frontend/messages/en.json` — that catalog
is the source of truth for these labels; component code should reference
the shared key rather than restating the string locally.

## Error-message formula

**What happened + what to do next.** A user reading an error should not
have to guess their next action.

```
✅ "Friendbot could not fund this account. Please try again."
✅ "Couldn't export your data. Please try again."
✅ "Select at least one merchant, or turn on \"Allow all merchants\""

❌ "Export failed."               — what happened, but no next step
❌ "Error"                        — neither
❌ "Oops! Something broke :("     — no next step, and breaks the calm-tone rule
```

Capitalize the first word only (sentence case), end with a period unless
the string is a short label/button (no terminal punctuation on buttons —
`Try again`, not `Try again.`).

## Before / after: real strings from this codebase

Found during the sweep for this guide (see the inventory below for the
full list of what was checked, not just what changed):

| Before                                                                   | After                                                    | File                                                            |
| ------------------------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------ |
| `Export failed.` (fallback when the export hook has no specific message) | `Couldn't export your data. Please try again.`           | `apps/frontend/components/settings/PrivacyExportCard.tsx`      |
| `Retry` (button label)                                                   | `Try again`                                              | `apps/frontend/app/escrows/page.tsx`                            |
| `Could not read wallet address` (fallback when Freighter returns no error message) | `Couldn't read the wallet address. Please try again.` | `apps/frontend/lib/wallet/freighterAdapter.ts`               |

All three are small, deliberate copy edits — no logic, no test behavior
changed. `ConflictResolutionCard`'s `Retry my decision` button was
reviewed and left as-is: it re-applies one specific offline mutation
rather than being a generic reload/retry, so it isn't the same voice
slot as the "Retry"/"Try again" pair above.

## Sweep inventory

Every user-visible string source was checked against this guide:

- `apps/frontend/messages/en.json` (`app.*`, `nav.*`, `common.*`,
  `forms.*`, `filters.*`, `delegations.wizard.*`, `settings.*`) —
  already consistent; no changes.
- Hardcoded strings in components not yet extracted to the i18n catalog
  (see `docs/i18n-extraction-ledger.md` for the full list of files) —
  searched for banned phrases, exclamation spam, and retry/cancel/close
  label drift. Found and fixed the two strings above; everything else
  checked (order tables, filters, wallet funding errors, notification
  copy, delegation wizard steps) was already consistent with this guide.
- `packages/ui/src` — no user-facing copy strings live in the shared
  component library itself (components take `label`/`children` props
  rather than owning their own text); nothing to sweep.

No judgment calls were left open for review — the two changes above were
unambiguous against the formula and conventions in this guide.

## CI lint aid

`apps/frontend/scripts/check-microcopy.mjs` runs a warning-level scan
over `apps/frontend/components`, `apps/frontend/app`, and
`apps/frontend/messages/en.json` for:

- Banned phrases: "oops", "sorry" (case-insensitive)
- Exclamation-spam: any user-visible string ending in `!`
- Bare `"Retry"` (as opposed to `"Try again"`) as a button/link label

It's wired into CI's `lint` job as a non-blocking warning — see
`pnpm --filter @delegolabs/web check:microcopy` to run it locally.
