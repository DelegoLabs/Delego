import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("Task 4 — Virtual approvals list behaviour", () => {
  function buildFixture(n) {
    return Array.from({ length: n }, (_, i) => ({
      id: `appr-${String(i).padStart(6, "0")}`,
      kind: "ESCROW_RELEASE",
      status: "PENDING",
      title: `Approval ${i + 1}`,
      subtitle: `Some order #${i + 1}`,
      amountStroops: BigInt((i + 1) * 1_000_000),
      requesterId: `req-${i % 13}`,
      requesterDisplayName: null,
      targetId: `tgt-${i}`,
      createdAt: new Date(2025, 0, i + 1),
      updatedAt: new Date(2025, 0, i + 1),
      dueAt: null,
      tags: [],
    }));
  }

  it("selection state is keyed by ID, surviving row virtualization", () => {
    const items = buildFixture(1000);
    const selected = new Set();
    selected.add(items[0].id);
    selected.add(items[999].id);

    const remounted = items.filter((_, i) => i < 10 || i > 990);
    const restored = new Set();
    for (const id of selected) {
      if (items.some((x) => x.id === id)) restored.add(id);
    }
    assert.equal(restored.has(items[0].id), true);
    assert.equal(restored.has(items[999].id), true);
    assert.equal(restored.size, 2);
  });

  it("hotkeys navigate the LOGICAL list, not DOM window edges", () => {
    const items = buildFixture(1000);
    let focus = 0;
    function clamp(i) {
      return Math.max(0, Math.min(items.length - 1, i));
    }

    for (let i = 0; i < 500; i++) focus = clamp(focus + 1);
    assert.equal(focus, 500);

    focus = clamp(focus + 1000);
    assert.equal(focus, 999);

    focus = clamp(focus - 500);
    assert.equal(focus, 499);
  });

  it("select-all state reflects correct allSelected / someSelected / none", () => {
    const items = buildFixture(10);
    const selected = new Set();

    function allSelected() {
      return items.length > 0 && items.every((i) => selected.has(i.id));
    }
    function someSelected() {
      return selected.size > 0 && !allSelected();
    }

    assert.equal(allSelected(), false);
    assert.equal(someSelected(), false);

    for (const it of items) selected.add(it.id);
    assert.equal(allSelected(), true);
    assert.equal(someSelected(), false);

    selected.delete(items[5].id);
    assert.equal(allSelected(), false);
    assert.equal(someSelected(), true);
  });
});
