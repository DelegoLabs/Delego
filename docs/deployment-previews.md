# PR preview deployments & required-check hygiene

Status: **workflow scaffolded, not yet active** — activating it and
locking down branch protection both require actions outside this repo
(a hosting account and GitHub admin access) that aren't available from
a PR. This doc records the decision and the exact steps to finish
FE-048.

## Host choice: Vercel

**Vercel**, for a few reasons specific to this repo:

- `apps/frontend` is a stock Next.js 15 App Router app with zero custom
  server code — Vercel is a first-class, zero-config target for that.
- No infra to maintain (Netlify and Cloudflare Pages both work too, but
  Vercel's preview-comment-per-PR flow is the most turnkey of the three
  for a Next.js monorepo app).
- **Cost tier**: the Hobby plan is free and sufficient for preview
  deployments on a single frontend app; upgrade to Pro ($20/user/month)
  only if the team needs more build concurrency, password-protected
  previews, or analytics later.

## What's already wired

`.github/workflows/preview-deploy.yml` builds and deploys
`apps/frontend` via the Vercel CLI on every PR push, and comments the
preview URL on the PR (updating the same comment on subsequent
pushes rather than spamming new ones). It's gated behind `if: false`
until the secrets below exist — flip that to activate it.

`.github/workflows/ci.yml` and `pr-checks.yml` already have
`concurrency` + `cancel-in-progress: true` (auto-cancels superseded
runs) and 7-day retention on uploaded artifacts (coverage report,
Playwright report).

## Manual setup steps (need Vercel + GitHub admin access)

1. **Create the Vercel project**: `vercel link` from `apps/frontend`
   against a new or existing Vercel team, or import the repo from the
   Vercel dashboard with root directory `apps/frontend`.
2. **Add repo secrets** (Settings → Secrets and variables → Actions):
   - `VERCEL_TOKEN` — a Vercel personal/team access token
   - `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` — from `.vercel/project.json`
     after step 1, or the Vercel project settings page
   - `STAGING_API_URL` — the staging gateway URL previews should call
     (maps to `NEXT_PUBLIC_API_URL` in the build step)
   - Since `@delegolabs/sdk`/`@delegolabs/types` are private GitHub
     Packages, also add `NPM_TOKEN` if it isn't already set (CI already
     uses it).
3. **Activate the workflow**: remove `if: false` from the
   `deploy-preview` job in `preview-deploy.yml`.
4. **Branch protection on `main`** (Settings → Branches → Add rule):
   - Require status checks to pass before merging; select `Lint`,
     `Type Check`, `Test`, `Build`, and `Accessibility Scan` (from
     `ci.yml`) as required checks. Add `Deploy Preview` once step 3 is
     live.
   - Require branches to be up to date before merging.
   - This is what blocks direct pushes to `main` per the FE-048
     acceptance criteria — it's an org/repo admin action, not something
     a workflow file can do on its own.


