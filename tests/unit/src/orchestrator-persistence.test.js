import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  persistWorkflowState,
  recoverWorkflowState,
  pool,
} from "../../../apps/backend/orchestrator/dist/src/persistence.js";

describe("Orchestrator State Persistence", () => {
  let originalQuery;
  let dbMock = {};

  before(() => {
    originalQuery = pool.query;

    // Manual database queries mock for unit testing persistence.ts logic
    pool.query = async (sql, params) => {
      const sqlNormalized = sql.trim().replace(/\s+/g, " ");

      if (sqlNormalized.startsWith("INSERT INTO purchase_workflows")) {
        const [orderId, userId, state, context] = params;
        if (dbMock[orderId]) {
          const err = new Error("duplicate key value violates unique constraint");
          err.code = "23505";
          throw err;
        }
        dbMock[orderId] = {
          order_id: orderId,
          user_id: userId,
          state,
          context: typeof context === "string" ? JSON.parse(context) : context,
          version: 1,
        };
        return { rowCount: 1, rows: [dbMock[orderId]] };
      }

      if (sqlNormalized.startsWith("UPDATE purchase_workflows")) {
        const [state, context, nextVersion, orderId, expectedVersion] = params;
        const record = dbMock[orderId];
        if (!record || record.version !== expectedVersion) {
          return { rowCount: 0, rows: [] };
        }
        dbMock[orderId] = {
          ...record,
          state,
          context: typeof context === "string" ? JSON.parse(context) : context,
          version: nextVersion,
        };
        return { rowCount: 1, rows: [dbMock[orderId]] };
      }

      if (sqlNormalized.startsWith("SELECT state, context FROM purchase_workflows")) {
        const [orderId] = params;
        const record = dbMock[orderId];
        if (!record) {
          return { rowCount: 0, rows: [] };
        }
        return { rowCount: 1, rows: [record] };
      }

      if (sqlNormalized.startsWith("SELECT version FROM purchase_workflows")) {
        const [orderId] = params;
        const record = dbMock[orderId];
        if (!record) {
          return { rowCount: 0, rows: [] };
        }
        return { rowCount: 1, rows: [{ version: record.version }] };
      }

      throw new Error(`Unhandled mock query: ${sql}`);
    };
  });

  after(() => {
    pool.query = originalQuery;
  });

  it("should successfully persist workflow state on initial save", async () => {
    dbMock = {};
    const orderId = "order_123";
    const state = "init";
    const context = { userId: "550e8400-e29b-41d4-a716-446655440000", step: "init" };

    await persistWorkflowState(orderId, state, context);

    assert.ok(dbMock[orderId]);
    assert.equal(dbMock[orderId].state, "init");
    assert.equal(dbMock[orderId].version, 1);
    assert.equal(dbMock[orderId].context.version, 1);
    assert.equal(context.version, 1);
  });

  it("should successfully update state on transition with optimistic lock", async () => {
    const orderId = "order_123";
    const state = "catalog";
    const context = { userId: "550e8400-e29b-41d4-a716-446655440000", step: "catalog", version: 1 };

    await persistWorkflowState(orderId, state, context);

    assert.equal(dbMock[orderId].state, "catalog");
    assert.equal(dbMock[orderId].version, 2);
    assert.equal(context.version, 2);
  });

  it("should throw version conflict error on concurrent modifications", async () => {
    const orderId = "order_123";
    const state = "approval";
    const context = { userId: "550e8400-e29b-41d4-a716-446655440000", step: "approval", version: 1 }; // Stale version

    await assert.rejects(
      async () => {
        await persistWorkflowState(orderId, state, context);
      },
      /Version conflict/
    );
  });

  it("should recover persisted state successfully", async () => {
    const orderId = "order_123";
    const recovered = await recoverWorkflowState(orderId);
    assert.ok(recovered);
    assert.equal(recovered.state, "catalog");
    assert.equal(recovered.context.version, 2);
  });

  it("should return null for non-existent workflows during recovery", async () => {
    const recovered = await recoverWorkflowState("non_existent");
    assert.equal(recovered, null);
  });
});
