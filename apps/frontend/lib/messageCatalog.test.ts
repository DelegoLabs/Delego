import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import en from "../messages/en.json";
import de from "../messages/de.json";

const APP_ROOT = join(__dirname, "..");
const MESSAGES_DIR = join(APP_ROOT, "messages");
const LOCALES = ["en", "de"] as const;

type Catalog = Record<string, unknown>;

/** Reads a message catalog straight off disk so the test sees the shipped JSON. */
function readCatalog(locale: string): Catalog {
  return JSON.parse(readFileSync(join(MESSAGES_DIR, `${locale}.json`), "utf8"));
}

/** Every `.ts`/`.tsx` source file, excluding tests, e2e specs and build output. */
function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (["node_modules", ".next", "e2e", ".turbo"].includes(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full));
    } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

/** Flattens a catalog to `a.b.c` leaf paths. */
function leafKeys(value: unknown, prefix = ""): Set<string> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return new Set(prefix ? [prefix] : []);
  }
  const out = new Set<string>();
  for (const [key, child] of Object.entries(value as Catalog)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (child !== null && typeof child === "object" && !Array.isArray(child)) {
      for (const nested of leafKeys(child, path)) out.add(nested);
    } else {
      out.add(path);
    }
  }
  return out;
}

function get(source: Catalog, path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>(
      (acc, key) =>
        acc && typeof acc === "object"
          ? (acc as Catalog)[key]
          : undefined,
      source
    );
}

describe("message catalogs", () => {
  const catalogs = Object.fromEntries(
    LOCALES.map((locale) => [locale, readCatalog(locale)])
  ) as Record<(typeof LOCALES)[number], Catalog>;

  it("ships a title for the document head", () => {
    // A missing root title makes every page fail the axe document-title rule.
    expect(readFileSync(join(APP_ROOT, "app", "layout.tsx"), "utf8")).toContain(
      "title:"
    );
  });

  it.each(LOCALES)("%s.json is valid and non-empty", (locale) => {
    expect(leafKeys(catalogs[locale]).size).toBeGreaterThan(0);
  });

  it("resolves every key requested via useTranslations in the reference locale", () => {
    const missing: string[] = [];

    for (const file of sourceFiles(APP_ROOT)) {
      const source = readFileSync(file, "utf8");

      // `const t = useTranslations("nav")` binds a namespace to an identifier.
      const bindings = new Map<string, string>();
      for (const match of source.matchAll(
        /const\s+(\w+)\s*=\s*useTranslations\(\s*["']([^"']+)["']\s*\)/g
      )) {
        bindings.set(match[1], match[2]);
      }

      for (const [identifier, namespace] of bindings) {
        const escaped = identifier.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const calls = new RegExp(
          `\\b${escaped}\\(\\s*["']([^"'\\x60$]+)["']`,
          "g"
        );
        for (const call of source.matchAll(calls)) {
          const path = `${namespace}.${call[1]}`;
          if (get(catalogs.en, path) === undefined) {
            missing.push(`${path} (${relative(APP_ROOT, file)})`);
          }
        }
      }
    }

    expect(missing).toEqual([]);
  });

  it("exposes the keys the app shell renders on every route", () => {
    // Header, MobileNav and Sidebar sit in the root layout, so a missing key
    // here throws during SSR and takes down every page at once.
    for (const locale of LOCALES) {
      expect(get(catalogs[locale], "nav.skipToContent")).toBeTruthy();
      expect(get(catalogs[locale], "agent.roster.fabAria")).toBeTruthy();
      expect(get(catalogs[locale], "fab.label")).toBeTruthy();
    }
  });

  it("imports the catalogs without altering them", () => {
    // Guards against a stale JSON import that silently diverges from disk.
    expect(en).toEqual(catalogs.en);
    expect(de).toEqual(catalogs.de);
  });
});