#!/usr/bin/env node
/**
 * Flake quarantine registry tooling (#630).
 *
 * PR CI has to stay fast, so a test that proves flaky cannot be allowed to
 * block every merge — but silently skipping it forever is worse. This script
 * implements the middle path: flakes are recorded in `quarantine.json` with a
 * 14-day clock, excluded from the PR gate via `grepInvert` (see
 * playwright.config.ts), and automatically re-enabled when the clock runs out.
 *
 * Modes:
 *   detect  — read Playwright JSON reports, record newly-flaky tests
 *   expire  — drop entries past their 14-day window (the "expiry bot")
 *   digest  — render the weekly triage digest
 *   pattern — print the `grepInvert` pattern for the current registry
 *
 * Dependency-free on purpose: it runs from a bare `actions/setup-node`
 * checkout without `pnpm install`, so the nightly workflow can act on test
 * results even when dependency installation itself is what broke.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

/** How long a quarantined test may stay disabled before it is re-enabled. */
export const QUARANTINE_WINDOW_DAYS = 14;

const DAY_MS = 24 * 60 * 60 * 1000;

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Default registry location: `apps/frontend/quarantine.json`. */
export const DEFAULT_REGISTRY_PATH = path.resolve(__dirname, "..", "quarantine.json");

/** A registry with nothing quarantined. */
export function emptyRegistry(now = new Date()) {
  return { updatedAt: now.toISOString(), quarantined: [] };
}

/** Reads the registry, falling back to an empty one when missing/corrupt. */
export function readRegistry(filePath = DEFAULT_REGISTRY_PATH) {
  if (!existsSync(filePath)) return emptyRegistry();
  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf8"));
    return {
      updatedAt: parsed.updatedAt ?? new Date(0).toISOString(),
      quarantined: Array.isArray(parsed.quarantined) ? parsed.quarantined : [],
    };
  } catch {
    return emptyRegistry();
  }
}

/** Writes the registry back, sorted by title so diffs stay stable. */
export function writeRegistry(registry, filePath = DEFAULT_REGISTRY_PATH) {
  const sorted = {
    updatedAt: registry.updatedAt,
    quarantined: [...registry.quarantined].sort((a, b) =>
      a.title.localeCompare(b.title)
    ),
  };
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(sorted, null, 2)}\n`, "utf8");
  return sorted;
}

/** Escapes a string for safe use inside a RegExp alternation. */
export function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Builds the Playwright `grepInvert` pattern covering every quarantined test,
 * or `undefined` when nothing is quarantined (so the config stays untouched).
 */
export function buildGrepInvertPattern(registry) {
  const titles = registry.quarantined.map((entry) => entry.title).filter(Boolean);
  if (titles.length === 0) return undefined;
  return titles.map(escapeRegExp).join("|");
}

/**
 * Walks a parsed Playwright JSON report and returns one record per flaky test.
 * Playwright labels a test `flaky` when it failed and then passed on retry —
 * exactly the "pass-on-retry ⇒ flagged" rule from the issue.
 */
export function collectFlakes(report, found = []) {
  const suites = Array.isArray(report?.suites) ? report.suites : [];

  for (const suite of suites) {
    if (Array.isArray(suite.suites) && suite.suites.length > 0) {
      collectFlakes({ suites: suite.suites }, found);
    }

    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) {
        const results = Array.isArray(test.results) ? test.results : [];
        const failedFirst = results.some((r) => r.status === "failed");
        const passedEventually = results.at(-1)?.status === "passed";
        const isFlaky = test.status === "flaky" || (failedFirst && passedEventually);

        if (!isFlaky) continue;

        found.push({
          title: spec.title,
          file: spec.file ?? suite.file ?? "",
          project: test.projectName ?? "",
          attempts: results.length,
          quarantinedAt: new Date().toISOString(),
        });
      }
    }
  }

  return found;
}

/** Reads every Playwright JSON report under `dir` (recursively) and collects flakes. */
export function collectFlakesFromDir(dir) {
  if (!existsSync(dir)) return [];

  const reportFiles = [];
  const walk = (current) => {
    for (const entry of readdirSync(current)) {
      const full = path.join(current, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (entry.endsWith(".json")) reportFiles.push(full);
    }
  };
  walk(dir);

  const found = [];
  for (const file of reportFiles) {
    try {
      const report = JSON.parse(readFileSync(file, "utf8"));
      if (!report || (!report.suites && !report.stats)) continue; // not a Playwright report
      collectFlakes(report, found);
    } catch {
      // Not JSON / truncated report — skip rather than fail the nightly job.
    }
  }
  return found;
}

/**
 * Records newly-detected flakes, leaving already-known ones (and their original
 * 14-day clock) alone. Returns the updated registry plus the entries added.
 */
export function addFlakes(registry, flakes, now = new Date()) {
  const known = new Set(registry.quarantined.map((entry) => entry.title));
  const expiresAt = new Date(now.getTime() + QUARANTINE_WINDOW_DAYS * DAY_MS).toISOString();

  const added = [];
  for (const flake of flakes) {
    if (!flake.title || known.has(flake.title)) continue;
    known.add(flake.title);
    added.push({ ...flake, expiresAt });
  }

  return {
    registry: {
      updatedAt: now.toISOString(),
      quarantined: [...registry.quarantined, ...added],
    },
    added,
  };
}

/** Drops entries whose 14-day window has closed — the expiry bot's re-enable step. */
export function expireEntries(registry, now = new Date()) {
  const expired = [];
  const kept = [];

  for (const entry of registry.quarantined) {
    const expiry = entry.expiresAt ? new Date(entry.expiresAt).getTime() : NaN;
    const isExpired = Number.isNaN(expiry) || expiry <= now.getTime();
    if (isExpired) expired.push(entry);
    else kept.push(entry);
  }

  return { registry: { updatedAt: now.toISOString(), quarantined: kept }, expired };
}

/** Markdown body for the nightly "new flakes quarantined" issue. */
export function buildQuarantineIssueBody({ added, runUrl, expiresAt }) {
  const rows = added.map(
    (flake) =>
      `| \`${flake.title}\` | ${flake.project || "—"} | \`${flake.file}\` | ${flake.attempts} |`
  );

  return [
    "## 🧪 Nightly flake quarantine",
    "",
    `${added.length} test(s) passed only on retry in the nightly full-suite run and have been quarantined for ${QUARANTINE_WINDOW_DAYS} days.`,
    "",
    "| Test | Project | File | Attempts |",
    "|------|---------|------|----------|",
    ...rows,
    "",
    `- Nightly run: ${runUrl || "(unavailable)"}`,
    "- Traces/videos for this run are attached to the workflow run's `playwright-artifacts` upload (retained 14 days).",
    `- Quarantined tests are excluded from the PR gate and **must be fixed or deleted by ${expiresAt}**, at which point the expiry bot re-enables them automatically.`,
    "",
    "See [docs/testing/flake-quarantine-runbook.md](docs/testing/flake-quarantine-runbook.md) for the triage rotation.",
  ].join("\n");
}

/**
 * Markdown body for the expiry bot's pull request. The PR is the re-enable
 * event, so it has to say exactly which tests are coming back and why they
 * should not simply be re-quarantined.
 */
export function buildExpiryPrBody({ expired, now = new Date() }) {
  const lines = expired.map(
    (entry) => `- \`${entry.title}\`${entry.project ? ` (${entry.project})` : ""}`
  );

  return [
    "## ⏳ Quarantine window closed",
    "",
    `${expired.length} test(s) have been re-enabled and are back in the PR gate (as of ${now.toISOString()}):`,
    "",
    ...lines,
    "",
    "Each entry stayed quarantined for the full 14-day window, so either fix it or",
    "delete it — do not re-quarantine it without a fix.",
    "",
    "See [docs/testing/flake-quarantine-runbook.md](docs/testing/flake-quarantine-runbook.md) for the triage rotation.",
  ].join("\n");
}

/** Markdown body for the weekly triage digest. */
export function buildDigestIssueBody({ registry, now = new Date() }) {
  if (registry.quarantined.length === 0) {
    return [
      "## 🗓️ Weekly flake digest",
      "",
      "No tests are currently quarantined. Nothing to triage — nice.",
    ].join("\n");
  }

  const rows = registry.quarantined
    .slice()
    .sort((a, b) => String(a.expiresAt).localeCompare(String(b.expiresAt)))
    .map((entry) => {
      const daysLeft = Math.ceil(
        (new Date(entry.expiresAt).getTime() - now.getTime()) / DAY_MS
      );
      const urgency = daysLeft <= 3 ? "⚠️" : "✅";
      return `| \`${entry.title}\` | ${entry.project || "—"} | ${entry.quarantinedAt?.slice(0, 10) ?? "—"} | ${entry.expiresAt?.slice(0, 10) ?? "—"} | ${urgency} ${Math.max(0, daysLeft)}d |`;
    });

  return [
    "## 🗓️ Weekly flake digest",
    "",
    `${registry.quarantined.length} test(s) are quarantined. Please pick one or two to fix or delete during triage rotation.`,
    "",
    "| Test | Project | Quarantined | Expires | Days left |",
    "|------|---------|-------------|---------|-----------|",
    ...rows,
    "",
    "Quarantines auto-expire (and the test is re-enabled) after 14 days, so anything left here will return to the PR gate on its own.",
    "",
    "See [docs/testing/flake-quarantine-runbook.md](docs/testing/flake-quarantine-runbook.md).",
  ].join("\n");
}

// ─── CLI ─────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) args[key] = true;
    else {
      args[key] = next;
      i += 1;
    }
  }
  return args;
}

function main(argv) {
  const [command, ...rest] = argv;
  const args = parseArgs(rest);
  const registryPath = args.registry ?? DEFAULT_REGISTRY_PATH;
  const now = args.now ? new Date(args.now) : new Date();

  switch (command) {
    case "detect": {
      const flakes = args.reports ? collectFlakesFromDir(args.reports) : [];
      const registry = readRegistry(registryPath);
      const { registry: updated, added } = addFlakes(registry, flakes, now);
      writeRegistry(updated, registryPath);

      const expiresAt = added[0]?.expiresAt ?? null;
      const payload = { added, expiresAt, total: updated.quarantined.length };
      if (typeof args.out === "string") writeFileSync(args.out, `${JSON.stringify(payload, null, 2)}\n`);

      if (typeof args["issue-body"] === "string") {
        writeFileSync(
          args["issue-body"],
          `${buildQuarantineIssueBody({ added, runUrl: args["run-url"], expiresAt })}\n`
        );
      }

      console.log(
        `[quarantine] detect: ${flakes.length} flaky test(s) seen, ${added.length} newly quarantined (${updated.quarantined.length} total).`
      );
      for (const flake of added) console.log(`  + ${flake.title} (${flake.project})`);
      return 0;
    }

    case "expire": {
      const { registry, expired } = expireEntries(readRegistry(registryPath), now);
      writeRegistry(registry, registryPath);

      if (typeof args.out === "string") {
        writeFileSync(args.out, `${JSON.stringify({ expired }, null, 2)}\n`);
      }

      if (typeof args["pr-body"] === "string") {
        writeFileSync(args["pr-body"], `${buildExpiryPrBody({ expired, now })}\n`);
      }

      console.log(
        `[quarantine] expire: ${expired.length} test(s) re-enabled (${registry.quarantined.length} still quarantined).`
      );
      for (const entry of expired) console.log(`  - ${entry.title}`);
      return 0;
    }

    case "digest": {
      const registry = readRegistry(registryPath);
      const body = `${buildDigestIssueBody({ registry, now })}\n`;
      if (typeof args.out === "string") writeFileSync(args.out, body);
      else process.stdout.write(body);
      return 0;
    }

    case "pattern": {
      const pattern = buildGrepInvertPattern(readRegistry(registryPath));
      if (pattern) process.stdout.write(pattern);
      return 0;
    }

    default:
      console.error(
        "Usage: quarantine.mjs <detect|expire|digest|pattern> [--reports <dir>] [--registry <file>] [--out <file>] [--run-url <url>] [--issue-body <file>] [--pr-body <file>]"
      );
      return 1;
  }
}

// Only run the CLI when invoked directly, so tests can import the helpers.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
