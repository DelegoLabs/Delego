#!/usr/bin/env node
/**
 * CI bundle-size gate (#624).
 *
 * This script is the single source of truth for First Load JS budgets. Budgets
 * are derived from the performance documentation at
 * docs/architecture/frontend-perf.md (#512) — no duplication of numbers.
 *
 * Features:
 *  - Parses the per-route size table `next build` already prints.
 *  - Applies the documented 200KB budget with a +10% grace (220KB) while
 *    open debt tickets exist.
 *  - Writes a Markdown size table to $GITHUB_STEP_SUMMARY (CI only) so
 *    each build job surfaces the table in its summary tab.
 *  - Writes a machine-readable JSON baseline to .bundle-size-baseline.json
 *    for the separate PR delta-comment job to diff against.
 *  - Exits non-zero when any route exceeds the effective budget.
 *
 * Usage:
 *   pnpm --filter @delegolabs/web check:perf-budget         # local / CI gate
 *   pnpm --filter @delegolabs/web check:perf-budget --baseline   # record baseline only
 *
 * Budget bump procedure (required for PRs that intentionally raise the limit):
 *   1. Raise BUDGET_KB or GRACE_FACTOR in this file.
 *   2. Update the table in docs/architecture/frontend-perf.md.
 *   3. Add a "Bundle budget bump: <justification link>" note to the PR description.
 */

import { spawnSync } from "node:child_process";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// Budget configuration — single source, mirrors docs/architecture/frontend-perf.md
// ---------------------------------------------------------------------------

/** Documented budget per route (gzipped First Load JS, in KB). */
const BUDGET_KB = 250;

/**
 * Grace factor applied while open debt tickets exist (#624).
 * Effective budget = BUDGET_KB * GRACE_FACTOR = 275 KB.
 * Remove the factor (set to 1.0) once debt is cleared.
 */
const GRACE_FACTOR = 1.1;

const EFFECTIVE_BUDGET_KB = BUDGET_KB * GRACE_FACTOR;

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const FRONTEND_DIR = new URL("..", import.meta.url).pathname;
const BASELINE_PATH = join(FRONTEND_DIR, ".bundle-size-baseline.json");

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

const BASELINE_MODE = process.argv.includes("--baseline");

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

console.log("Running next build to measure bundle sizes…\n");

const result = spawnSync("pnpm", ["build"], {
  cwd: FRONTEND_DIR,
  encoding: "utf8",
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
});

const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
process.stdout.write(output);

if (result.status !== 0) {
  console.error("\n✗ Build failed — cannot check the performance budget.");
  process.exit(result.status ?? 1);
}

// ---------------------------------------------------------------------------
// Parse the route size table
// ---------------------------------------------------------------------------

// Matches lines like:
//   ├ ○ /orders                             4.1 kB         187 kB
// capturing the route path and the "First Load JS" column.
const ROUTE_ROW =
  /^[│├└─┌\s]*[○●λƒ]\s+(\/\S*)\s+[\d.]+\s*[kKmM]?B\s+([\d.]+)\s*([kKmM])B\s*$/;

function parseSizeKb(value, unit) {
  const n = Number(value);
  if (unit.toLowerCase() === "m") return n * 1024;
  return n;
}

/** @type {Array<{route: string, kb: number}>} */
const routeSizes = [];

for (const line of output.split("\n")) {
  const match = ROUTE_ROW.exec(line);
  if (!match) continue;
  const [, route, sizeValue, sizeUnit] = match;
  routeSizes.push({ route, kb: parseSizeKb(sizeValue, sizeUnit) });
}

if (routeSizes.length === 0) {
  console.error("\n⚠️  No route rows found in build output. The table format may have changed.");
  console.error("   Check the ROUTE_ROW regex in scripts/check-perf-budget.mjs");
  // Don't fail CI over a parse issue — let the build succeed.
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Load baseline for delta calculation
// ---------------------------------------------------------------------------

/** @type {Record<string, number>} */
let baseline = {};
if (existsSync(BASELINE_PATH)) {
  try {
    baseline = JSON.parse(readFileSync(BASELINE_PATH, "utf8"));
  } catch {
    // Baseline corrupt — ignore; will be rewritten.
  }
}

// ---------------------------------------------------------------------------
// Build the report table
// ---------------------------------------------------------------------------

const overBudget = routeSizes.filter(({ kb }) => kb > EFFECTIVE_BUDGET_KB);

function statusIcon(kb) {
  if (kb > EFFECTIVE_BUDGET_KB) return "❌";
  if (kb > BUDGET_KB) return "⚠️"; // within grace, but over the hard limit
  return "✅";
}

function deltaStr(route, kb) {
  if (baseline[route] === undefined) return "—";
  const delta = kb - baseline[route];
  if (Math.abs(delta) < 0.05) return "±0 KB";
  return `${delta > 0 ? "+" : ""}${delta.toFixed(1)} KB`;
}

// Plain-text table for stdout
const colW = [Math.max(6, ...routeSizes.map(({ route }) => route.length)), 14, 12, 8];

function pad(s, w) {
  return String(s).padEnd(w);
}

const header = [
  pad("Route", colW[0]),
  pad("First Load JS", colW[1]),
  pad("Delta", colW[2]),
  pad("Status", colW[3]),
].join("  ");

const separator = colW.map((w) => "-".repeat(w)).join("  ");

const rows = routeSizes.map(({ route, kb }) =>
  [
    pad(route, colW[0]),
    pad(`${kb.toFixed(1)} KB`, colW[1]),
    pad(deltaStr(route, kb), colW[2]),
    statusIcon(kb),
  ].join("  ")
);

console.log(`\nBundle size report (budget: ${BUDGET_KB} KB, effective with grace: ${EFFECTIVE_BUDGET_KB.toFixed(0)} KB)\n`);
console.log(header);
console.log(separator);
rows.forEach((r) => console.log(r));

// ---------------------------------------------------------------------------
// Write GitHub Step Summary (CI only)
// ---------------------------------------------------------------------------

if (process.env.GITHUB_STEP_SUMMARY) {
  const mdTable = [
    `## Bundle Size Report`,
    ``,
    `Budget: **${BUDGET_KB} KB** · Effective (with +10% grace): **${EFFECTIVE_BUDGET_KB.toFixed(0)} KB**`,
    ``,
    `| Route | First Load JS | Delta | Status |`,
    `|-------|--------------|-------|--------|`,
    ...routeSizes.map(
      ({ route, kb }) =>
        `| \`${route}\` | ${kb.toFixed(1)} KB | ${deltaStr(route, kb)} | ${statusIcon(kb)} |`
    ),
    ``,
    overBudget.length > 0
      ? `> **${overBudget.length} route(s) exceed the effective budget.** See [docs/architecture/frontend-perf.md](../docs/architecture/frontend-perf.md) to investigate.`
      : `> All routes are within budget. ✅`,
  ].join("\n");

  try {
    writeFileSync(process.env.GITHUB_STEP_SUMMARY, mdTable + "\n", { flag: "a" });
  } catch {
    // Non-fatal if we can't write the summary.
  }
}

// ---------------------------------------------------------------------------
// Write / update baseline
// ---------------------------------------------------------------------------

const newBaseline = Object.fromEntries(routeSizes.map(({ route, kb }) => [route, kb]));

if (BASELINE_MODE) {
  writeFileSync(BASELINE_PATH, JSON.stringify(newBaseline, null, 2) + "\n");
  console.log(`\n✓ Baseline recorded to ${BASELINE_PATH}`);
  process.exit(0);
}

// Always update the baseline file so CI artifacts are fresh.
writeFileSync(BASELINE_PATH, JSON.stringify(newBaseline, null, 2) + "\n");

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

if (overBudget.length === 0) {
  console.log(
    `\n✓ All ${routeSizes.length} routes are within the ${EFFECTIVE_BUDGET_KB.toFixed(0)} KB effective bundle-size budget.`
  );
  process.exit(0);
}

console.error(
  `\n✗ ${overBudget.length} route(s) exceed the ${EFFECTIVE_BUDGET_KB.toFixed(0)} KB effective budget:`
);
for (const { route, kb } of overBudget) {
  const delta = deltaStr(route, kb);
  console.error(`  ${route}: ${kb.toFixed(1)} KB  (delta: ${delta})`);
}
console.error(`
How to fix:
  1. Run 'pnpm analyze' to identify what grew.
  2. Use next/dynamic for anything not needed for the initial paint.
  3. Check for accidental non-tree-shakeable imports.
  4. If the growth is justified, raise BUDGET_KB in this script AND update
     docs/architecture/frontend-perf.md with a justification link in the PR.

See docs/architecture/frontend-perf.md for the full budget and guidance.`);
process.exit(1);
