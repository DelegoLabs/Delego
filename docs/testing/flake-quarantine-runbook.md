# Flake Quarantine Runbook

How Delego keeps PR CI fast without letting flaky tests quietly delete
themselves from the suite (#630).

## The bargain

A flaky test gets **14 days** of quarantine. During that window it is excluded
from the PR gate and keeps running in the nightly suite so a fix can be proven.
After 14 days the expiry bot re-enables it automatically. "Quarantine" is
therefore a deadline, never a permanent skip.

| Stage | Where it lives | Trigger |
| --- | --- | --- |
| Detect (pass-on-retry ⇒ flagged) | `.github/workflows/nightly.yml` | 02:00 UTC daily + manual |
| Registry | `apps/frontend/quarantine.json` | updated by the nightly job |
| Exclusion from the PR gate | `apps/frontend/playwright.config.ts` (`grepInvert`) | every PR |
| Triage issue | `.github/workflows/nightly.yml` | when new flakes appear |
| Expiry / re-enable | `.github/workflows/quarantine-expiry.yml` | 06:00 UTC daily |
| Weekly digest | `.github/workflows/flake-digest.yml` | Mondays 09:00 UTC |

## Nightly pipeline

1. **Unit suite** runs in full with coverage (`unit` job).
2. **E2E matrix** runs each cell with `--retries=1` and
   `PLAYWRIGHT_INCLUDE_QUARANTINE=1`, i.e. quarantined tests are exercised
   too — otherwise a fix could never be proven. Cells are
   `{chromium, mobile-chrome} × {light, dark}`; the theme is applied by the
   `mockedPage` fixture from `E2E_THEME`.
3. A test that only passes on retry is reported by Playwright as `flaky`. The
   `quarantine` job walks every JSON report with
   `scripts/quarantine.mjs detect`, appends newly-flaky tests to
   `apps/frontend/quarantine.json` with a 14-day `expiresAt`, and:
   - opens (or comments on) an issue labelled `quarantine/` + `area/testing`,
     linking the run so the traces/videos in the run's artifacts are one click
     away, and
   - opens a PR against `main` with the registry change (the registry must live
     in the repo for the PR gate to read it).
4. All artifacts — traces, videos and JSON reports — are retained **14 days**,
   matching the quarantine window.

## Pull-request gate

`playwright.config.ts` reads `quarantine.json` and passes the titles to
Playwright's `grepInvert`, so quarantined tests simply don't run on a PR.
Nothing is added to `ci.yml`, so PR wall-time is unchanged — and as soon as
anything is quarantined, the gate gets *faster* by exactly those tests.

`PLAYWRIGHT_INCLUDE_QUARANTINE=1` disables the exclusion (used by the nightly
run). A missing or corrupt registry degrades to "exclude nothing" rather than
failing the suite.

## Daily triage rotation

Whoever is on rotation:

1. Read the latest `quarantine/` issue (or the Monday digest).
2. Pick one or two tests. Open the linked run, download the
   `nightly-e2e-*` artifact and look at the trace for the failed first attempt.
3. Either **fix** the test/app bug, or **delete** the test if it no longer
   tests anything real. Do not re-quarantine without a fix — that just resets
   a timer nobody owns.
4. Remove the entry from `apps/frontend/quarantine.json`. That re-enables the
   test in the PR gate immediately, so the proving run is the PR itself.

The digest flags entries with ≤ 3 days left as ⚠️ so the rotation can clear
them before the bot does it for you.

## Exit criteria for a flaky test

A test comes out of quarantine when **all** of:

- the root cause is understood (timing assumption, shared state, network
  dependence, nondeterministic fixture — not "it passed once"),
- it passes the nightly cell repeatedly **with retries disabled**, or the
  assertion was made deterministic,
- the registry entry is deleted in the same change.

## Generating a flake on purpose (chaos test)

`apps/frontend/e2e/chaos/injected-flake.spec.ts` fails its first attempt and
passes on retry. It is skipped unless `E2E_CHAOS=1`, which the nightly E2E job
sets. Running the nightly workflow manually therefore walks the **whole**
pipeline end to end:

```
detect → registry entry → quarantine/ label → issue → (14 days) → expiry re-enable
```

To exercise it locally:

```bash
cd apps/frontend
pnpm test:e2e:nightly -- --project=chromium --grep "chaos"
```

Then run the detection step against the report it produces:

```bash
pnpm quarantine:detect -- --reports test-results
```

## Local commands

| Command | Purpose |
| --- | --- |
| `pnpm --filter @delegolabs/web test:e2e:nightly` | Run E2E cell(s) including quarantined + chaos tests |
| `pnpm --filter @delegolabs/web quarantine:detect -- --reports <dir>` | Record flakes from a report directory |
| `pnpm --filter @delegolabs/web quarantine:expire` | Re-enable every entry past its window |
| `node apps/frontend/scripts/quarantine.mjs pattern` | Print the current `grepInvert` pattern |

The script is dependency-free (`node:fs` only) so it still runs if the nightly's
`pnpm install` is what failed.
