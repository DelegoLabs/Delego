#!/usr/bin/env node
/**
 * Seeded demo dataset CLI (#631).
 *
 *   pnpm seed:demo --export [path]   write a JSON snapshot
 *   pnpm seed:demo --mock            boot the Next.js dev server against MSW
 *                                    with this world
 *
 * Two `--export` runs are byte-identical (see mocks/demoWorld.test.ts).
 */
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  generateDemoWorld,
  serializeDemoWorld,
} from "../mocks/generateDemoWorld.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");
const defaultExportPath = resolve(
  here,
  "../mocks/fixtures/demo-world.json"
);

function parseArgs(argv) {
  const args = { mock: false, export: false, exportPath: defaultExportPath };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--mock") args.mock = true;
    else if (token === "--export") {
      args.export = true;
      const next = argv[i + 1];
      if (next && !next.startsWith("-")) {
        args.exportPath = resolve(process.cwd(), next);
        i += 1;
      }
    } else if (token === "--help" || token === "-h") {
      args.help = true;
    }
  }
  if (!args.mock && !args.export) args.export = true;
  return args;
}

async function exportWorld(path) {
  const json = serializeDemoWorld(generateDemoWorld());
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, json, "utf8");
  return path;
}

function bootMock() {
  const env = {
    ...process.env,
    NEXT_PUBLIC_MOCK_API: "true",
    NEXT_PUBLIC_SEED_DEMO: "true",
  };
  const child = spawn("pnpm", ["--filter", "@delegolabs/web", "dev"], {
    cwd: repoRoot,
    env,
    stdio: "inherit",
  });
  child.on("exit", (code) => {
    process.exit(code ?? 0);
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(
      "Usage: pnpm seed:demo [--export [path]] [--mock]\n" +
        "  --export  Write a deterministic JSON snapshot (default)\n" +
        "  --mock    Start the Next.js dev server against this world via MSW\n"
    );
    return;
  }
  if (args.export) {
    const path = await exportWorld(args.exportPath);
    process.stdout.write(`Wrote demo world to ${path}\n`);
  }
  if (args.mock) {
    process.stdout.write(
      "Starting dev server with NEXT_PUBLIC_MOCK_API=true NEXT_PUBLIC_SEED_DEMO=true\n"
    );
    bootMock();
  }
}

main().catch((err) => {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
