import { describe, it, expect } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  QUARANTINE_WINDOW_DAYS,
  addFlakes,
  buildDigestIssueBody,
  buildExpiryPrBody,
  buildGrepInvertPattern,
  buildQuarantineIssueBody,
  collectFlakes,
  collectFlakesFromDir,
  emptyRegistry,
  escapeRegExp,
  expireEntries,
  readRegistry,
  writeRegistry,
} from "./quarantine.mjs";

const NOW = new Date("2026-09-28T00:00:00.000Z");

function makeReport(tests) {
  return {
    stats: { startTime: NOW.toISOString() },
    suites: [
      {
        title: "golden-paths.spec.ts",
        file: "e2e/golden-paths.spec.ts",
        specs: [
          {
            title: "golden path: approve › approve a pending order",
            file: "e2e/golden-paths.spec.ts",
            tests,
          },
        ],
      },
    ],
  };
}

describe("escapeRegExp", () => {
  it("escapes regex metacharacters so titles match literally", () => {
    expect(escapeRegExp("a.b(c)[d]")).toBe("a\\.b\\(c\\)\\[d\\]");
  });
});

describe("buildGrepInvertPattern", () => {
  it("returns undefined when nothing is quarantined", () => {
    expect(buildGrepInvertPattern(emptyRegistry(NOW))).toBeUndefined();
  });

  it("joins quarantined titles into one alternation", () => {
    const registry = {
      updatedAt: NOW.toISOString(),
      quarantined: [{ title: "first test" }, { title: "second (test)" }],
    };
    expect(buildGrepInvertPattern(registry)).toBe("first test|second \\(test\\)");
  });
});

describe("collectFlakes", () => {
  it("flags a test that failed then passed on retry", () => {
    const flakes = collectFlakes(
      makeReport([
        {
          projectName: "chromium",
          status: "flaky",
          results: [{ status: "failed" }, { status: "passed" }],
        },
      ])
    );

    expect(flakes).toHaveLength(1);
    expect(flakes[0]).toMatchObject({
      title: "golden path: approve › approve a pending order",
      project: "chromium",
      attempts: 2,
    });
  });

  it("flags a pass-on-retry even when the report omits a flaky status", () => {
    const flakes = collectFlakes(
      makeReport([
        { projectName: "mobile-chrome", results: [{ status: "failed" }, { status: "passed" }] },
      ])
    );

    expect(flakes).toHaveLength(1);
    expect(flakes[0].project).toBe("mobile-chrome");
  });

  it("ignores consistently passing and consistently failing tests", () => {
    const flakes = collectFlakes(
      makeReport([
        { projectName: "chromium", status: "expected", results: [{ status: "passed" }] },
        { projectName: "chromium", status: "unexpected", results: [{ status: "failed" }] },
      ])
    );

    expect(flakes).toHaveLength(0);
  });

  it("tolerates an empty or malformed report", () => {
    expect(collectFlakes({})).toEqual([]);
    expect(collectFlakes(null)).toEqual([]);
  });
});

describe("collectFlakesFromDir", () => {
  it("reads nested report files and skips non-reports", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "quarantine-"));
    writeFileSync(
      path.join(dir, "report.json"),
      JSON.stringify(
        makeReport([{ projectName: "chromium", results: [{ status: "failed" }, { status: "passed" }] }])
      )
    );
    writeFileSync(path.join(dir, "not-a-report.json"), JSON.stringify({ hello: "world" }));

    expect(collectFlakesFromDir(dir)).toHaveLength(1);
    expect(collectFlakesFromDir(path.join(dir, "missing"))).toEqual([]);
  });
});

describe("addFlakes", () => {
  const flake = { title: "flaky test", file: "e2e/x.spec.ts", project: "chromium", attempts: 2 };

  it("quarantines a new flake with a 14-day expiry", () => {
    const { registry, added } = addFlakes(emptyRegistry(NOW), [flake], NOW);

    expect(added).toHaveLength(1);
    expect(registry.quarantined).toHaveLength(1);
    expect(added[0].expiresAt).toBe(
      new Date(NOW.getTime() + QUARANTINE_WINDOW_DAYS * 24 * 3600 * 1000).toISOString()
    );
  });

  it("is idempotent — a known flake keeps its original clock", () => {
    const first = addFlakes(emptyRegistry(NOW), [flake], NOW);
    const second = addFlakes(first.registry, [flake], new Date(NOW.getTime() + 3600 * 1000));

    expect(second.added).toHaveLength(0);
    expect(second.registry.quarantined).toHaveLength(1);
    expect(second.registry.quarantined[0].expiresAt).toBe(first.added[0].expiresAt);
  });
});

describe("expireEntries", () => {
  function registryWith(expiresAt) {
    return { updatedAt: NOW.toISOString(), quarantined: [{ title: "t", expiresAt }] };
  }

  it("re-enables a test once its window closes", () => {
    const { registry, expired } = expireEntries(
      registryWith("2026-09-27T00:00:00.000Z"),
      NOW
    );

    expect(expired).toHaveLength(1);
    expect(registry.quarantined).toHaveLength(0);
  });

  it("keeps a test whose window is still open", () => {
    const { registry, expired } = expireEntries(
      registryWith("2026-09-30T00:00:00.000Z"),
      NOW
    );

    expect(expired).toHaveLength(0);
    expect(registry.quarantined).toHaveLength(1);
  });

  it("re-enables entries with a missing expiry rather than quarantining forever", () => {
    const { expired } = expireEntries({ updatedAt: NOW.toISOString(), quarantined: [{ title: "t" }] }, NOW);
    expect(expired).toHaveLength(1);
  });
});

describe("readRegistry / writeRegistry", () => {
  it("round-trips through disk and sorts entries for stable diffs", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "quarantine-"));
    const file = path.join(dir, "quarantine.json");

    writeRegistry(
      {
        updatedAt: NOW.toISOString(),
        quarantined: [{ title: "z test" }, { title: "a test" }],
      },
      file
    );

    const roundTripped = readRegistry(file);
    expect(roundTripped.quarantined.map((entry) => entry.title)).toEqual(["a test", "z test"]);
    expect(readFileSync(file, "utf8")).toContain("\n");
  });

  it("falls back to an empty registry when the file is missing or corrupt", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "quarantine-"));
    expect(readRegistry(path.join(dir, "nope.json")).quarantined).toEqual([]);

    const corrupt = path.join(dir, "corrupt.json");
    writeFileSync(corrupt, "{ not json");
    expect(readRegistry(corrupt).quarantined).toEqual([]);
  });
});

describe("issue bodies", () => {
  it("renders a quarantine issue naming the expiry and run link", () => {
    const body = buildQuarantineIssueBody({
      added: [{ title: "flaky test", project: "chromium", file: "e2e/x.spec.ts", attempts: 2 }],
      runUrl: "https://example.com/run/1",
      expiresAt: "2026-10-12T00:00:00.000Z",
    });

    expect(body).toContain("Nightly flake quarantine");
    expect(body).toContain("flaky test");
    expect(body).toContain("https://example.com/run/1");
    expect(body).toContain("2026-10-12");
  });

  it("renders an expiry PR body listing the re-enabled tests", () => {
    const body = buildExpiryPrBody({
      expired: [{ title: "flaky test", project: "chromium" }],
      now: NOW,
    });

    expect(body).toContain("Quarantine window closed");
    expect(body).toContain("flaky test");
    expect(body).toContain("do not re-quarantine it without a fix");
  });

  it("renders an empty digest when nothing is quarantined", () => {
    expect(buildDigestIssueBody({ registry: emptyRegistry(NOW), now: NOW })).toContain(
      "No tests are currently quarantined"
    );
  });

  it("renders a digest row per quarantined test with days remaining", () => {
    const body = buildDigestIssueBody({
      registry: {
        updatedAt: NOW.toISOString(),
        quarantined: [
          {
            title: "flaky test",
            project: "chromium",
            quarantinedAt: "2026-09-20T00:00:00.000Z",
            expiresAt: "2026-10-04T00:00:00.000Z",
          },
        ],
      },
      now: NOW,
    });

    expect(body).toContain("flaky test");
    expect(body).toContain("6d");
    expect(body).toContain("2026-10-04");
  });
});
