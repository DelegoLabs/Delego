/**
 * Unit tests for services/txMonitor.ts (#583)
 *
 * Tests cover:
 *  - trackTransaction: adds to localStorage
 *  - DuplicateSubmissionError: thrown for already-pending hash
 *  - resolveTransaction: removes hash and fires listener
 *  - poll success path: listener receives "success" and hash is removed
 *  - poll failure path: listener receives "failed"
 *  - timeout path: listener receives "timeout" after elapsed time exceeds cap
 *  - duplicate-submission rejection
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DuplicateSubmissionError,
  _clearAllForTest,
  getTrackedTransactions,
  resolveTransaction,
  subscribeTxStatus,
  trackTransaction,
  type TxStatusUpdate,
} from "./txMonitor";

const HORIZON = "https://horizon-testnet.stellar.org";
const HASH_A =
  "aabbccddeeff001122334455667788990011223344556677889900112233445566";
const HASH_B =
  "bbccddee001122334455667788990011223344556677889900112233445566aabb";

beforeEach(() => {
  _clearAllForTest();
  vi.useFakeTimers();
});

afterEach(() => {
  _clearAllForTest();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ─── trackTransaction ──────────────────────────────────────────────────────

describe("trackTransaction", () => {
  it("persists the hash to localStorage as pending", () => {
    trackTransaction(HASH_A, HORIZON);
    const tracked = getTrackedTransactions();
    expect(tracked).toHaveLength(1);
    expect(tracked[0].hash).toBe(HASH_A);
    expect(tracked[0].status).toBe("pending");
  });

  it("throws DuplicateSubmissionError for an already-pending hash", () => {
    trackTransaction(HASH_A, HORIZON);
    expect(() => trackTransaction(HASH_A, HORIZON)).toThrow(
      DuplicateSubmissionError
    );
  });

  it("allows re-tracking a hash that previously resolved", () => {
    trackTransaction(HASH_A, HORIZON);
    resolveTransaction(HASH_A, "success");
    // After success it is removed from storage — re-tracking should work.
    expect(() => trackTransaction(HASH_A, HORIZON)).not.toThrow();
  });
});

// ─── resolveTransaction ────────────────────────────────────────────────────

describe("resolveTransaction", () => {
  it("removes the hash from tracked storage", () => {
    trackTransaction(HASH_A, HORIZON);
    resolveTransaction(HASH_A, "success");
    expect(
      getTrackedTransactions().find((t) => t.hash === HASH_A)
    ).toBeUndefined();
  });

  it("fires the listener with the resolved status", () => {
    const updates: TxStatusUpdate[] = [];
    subscribeTxStatus((u: TxStatusUpdate) => updates.push(u));

    trackTransaction(HASH_A, HORIZON);
    resolveTransaction(HASH_A, "failed");

    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({ hash: HASH_A, status: "failed" });
  });
});

// ─── Poll success path ─────────────────────────────────────────────────────

describe("poll: success path", () => {
  it("listener receives 'success' when Horizon returns successful:true", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ successful: true }), { status: 200 })
    );

    const updates: TxStatusUpdate[] = [];
    subscribeTxStatus((u: TxStatusUpdate) => updates.push(u));

    trackTransaction(HASH_A, HORIZON);

    // Advance past the initial poll delay (3 s).
    await vi.runAllTimersAsync();

    const successUpdate = updates.find((u) => u.status === "success");
    expect(successUpdate).toBeDefined();
    expect(successUpdate!.hash).toBe(HASH_A);

    // Hash should be removed from storage after success.
    expect(
      getTrackedTransactions().find((t) => t.hash === HASH_A)
    ).toBeUndefined();
  });
});

// ─── Poll failure path ─────────────────────────────────────────────────────

describe("poll: failure path", () => {
  it("listener receives 'failed' when Horizon returns successful:false", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ successful: false }), { status: 200 })
    );

    const updates: TxStatusUpdate[] = [];
    subscribeTxStatus((u: TxStatusUpdate) => updates.push(u));

    trackTransaction(HASH_A, HORIZON);
    await vi.runAllTimersAsync();

    const failUpdate = updates.find((u: TxStatusUpdate) => u.status === "failed");
    expect(failUpdate).toBeDefined();
    expect(failUpdate!.hash).toBe(HASH_A);
  });
});

// ─── Poll still-pending path ───────────────────────────────────────────────

describe("poll: still-pending path", () => {
  it("listener receives 'pending' while Horizon returns 404", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(null, { status: 404 })
    );

    const updates: TxStatusUpdate[] = [];
    subscribeTxStatus((u) => updates.push(u));

    trackTransaction(HASH_A, HORIZON);
    // Run only the first timer tick.
    await vi.advanceTimersByTimeAsync(3_100);

    const pendingUpdate = updates.find((u) => u.status === "pending");
    expect(pendingUpdate).toBeDefined();
  });
});

// ─── Timeout path ─────────────────────────────────────────────────────────

describe("poll: timeout path", () => {
  it("listener receives 'timeout' after 5 minutes of pending", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(null, { status: 404 })
    );

    const updates: TxStatusUpdate[] = [];
    subscribeTxStatus((u) => updates.push(u));

    trackTransaction(HASH_A, HORIZON);
    // Advance well past the 5-minute timeout.
    await vi.runAllTimersAsync();

    const timeoutUpdate = updates.find((u) => u.status === "timeout");
    expect(timeoutUpdate).toBeDefined();
    expect(timeoutUpdate!.hash).toBe(HASH_A);
  });
});

// ─── Multiple hashes ──────────────────────────────────────────────────────

describe("multiple hashes", () => {
  it("tracks multiple independent hashes simultaneously", () => {
    trackTransaction(HASH_A, HORIZON);
    trackTransaction(HASH_B, HORIZON);
    const tracked = getTrackedTransactions();
    expect(tracked).toHaveLength(2);
  });

  it("duplicate guard is hash-specific (does not block other hashes)", () => {
    trackTransaction(HASH_A, HORIZON);
    // HASH_B is not pending, so this should succeed.
    expect(() => trackTransaction(HASH_B, HORIZON)).not.toThrow();
  });
});
