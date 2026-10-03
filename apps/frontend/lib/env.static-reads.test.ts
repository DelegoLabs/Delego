import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "env.ts"), "utf8");

/**
 * The keys `envSchema` validates must be read as static `process.env.NEXT_PUBLIC_*`
 * member accesses so `next build` can inline them into browser bundles — a
 * computed `process.env[key]` lookup survives the bundler and resolves against
 * the browser's empty `process` shim, which throws during hydration and hands
 * the whole document to `global-error`. Because the reads cannot be derived
 * from the schema (the bundler only inlines literals it can see), they are
 * spelled out in `readRawEnv`, and this test is what keeps the two lists equal.
 */
describe("lib/env static reads", () => {
  const body = source.slice(source.indexOf("function readRawEnv"));
  const staticKeys = [...body.matchAll(/^\s{4}(NEXT_PUBLIC_[A-Z0-9_]+):/gm)].map((m) => m[1]);
  const schemaKeys = [...source.matchAll(/^\s{4}(NEXT_PUBLIC_[A-Z0-9_]+): z\b/gm)].map((m) => m[1]);

  it("reads every schema key as a static process.env member access", () => {
    expect(staticKeys.sort()).toEqual([...new Set(schemaKeys)].sort());
  });

  it("never validates through a computed process.env lookup", () => {
    // `...process.env` is the passthrough spread and is fine; only a member
    // read (`process.env[`) would defeat the inlining.
    expect(body).not.toMatch(/process\.env\s*\[/);
  });
});