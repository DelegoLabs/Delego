import pg from "pg";
import { createLogger } from "@delego/utils";

const { Pool } = pg;
const log = createLogger("orchestrator:db", process.env.LOG_LEVEL ?? "info");

const databaseUrl = process.env.DATABASE_URL ?? "postgresql://delego:delego@localhost:5432/delego";

export const pool = new Pool({
  connectionString: databaseUrl,
});

/**
 * Saves current machine state and context.
 * Implements optimistic concurrency version check to avoid overwriting concurrent workflow transitions.
 */
export async function persistWorkflowState(
  orderId: string,
  state: string,
  context: Record<string, any>
): Promise<void> {
  const userId = context.userId || "00000000-0000-0000-0000-000000000000";
  const expectedVersion = context.version ?? 1;
  const nextVersion = expectedVersion + 1;
  const updatedContext = { ...context, version: nextVersion };

  log.debug("Persisting workflow state", { orderId, state, expectedVersion });

  try {
    // Attempt optimistic update first
    const updateResult = await pool.query(
      `UPDATE purchase_workflows
       SET state = $1, context = $2, version = $3, updated_at = CURRENT_TIMESTAMP
       WHERE order_id = $4 AND version = $5`,
      [state, JSON.stringify(updatedContext), nextVersion, orderId, expectedVersion]
    );

    if (updateResult.rowCount === 0) {
      // Row count is 0; check if the row exists to differentiate missing record from version conflict
      const checkResult = await pool.query(
        `SELECT version FROM purchase_workflows WHERE order_id = $1`,
        [orderId]
      );

      if (checkResult.rows.length === 0) {
        // Record does not exist, perform initial insert
        try {
          const initialContext = { ...context, version: 1 };
          await pool.query(
            `INSERT INTO purchase_workflows (order_id, user_id, state, context, version, updated_at)
             VALUES ($1, $2, $3, $4, 1, CURRENT_TIMESTAMP)`,
            [orderId, userId, state, JSON.stringify(initialContext)]
          );
          log.info("Inserted new workflow state", { orderId, state });
          context.version = 1;
        } catch (err: any) {
          if (err.code === "23505") { // Unique violation
            throw new Error(`Version conflict: concurrent transaction inserted this workflow for order ${orderId}`);
          }
          throw err;
        }
      } else {
        // Record exists, but version check failed
        const currentVersion = checkResult.rows[0].version;
        throw new Error(
          `Version conflict: workflow has been modified. Expected version ${expectedVersion}, but database has version ${currentVersion}`
        );
      }
    } else {
      log.debug("Optimistically updated workflow state", { orderId, state, nextVersion });
      context.version = nextVersion;
    }
  } catch (err) {
    log.error("Failed to persist workflow state", {
      orderId,
      state,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

/**
 * Retrieves context on restart.
 */
export async function recoverWorkflowState(
  orderId: string
): Promise<{ state: string; context: Record<string, any> } | null> {
  log.debug("Recovering workflow state", { orderId });
  try {
    const result = await pool.query(
      `SELECT state, context FROM purchase_workflows WHERE order_id = $1`,
      [orderId]
    );

    if (result.rows.length === 0) {
      log.debug("No workflow state found for order", { orderId });
      return null;
    }

    const row = result.rows[0];
    return {
      state: row.state,
      context: typeof row.context === "string" ? JSON.parse(row.context) : row.context,
    };
  } catch (err) {
    log.error("Failed to recover workflow state", {
      orderId,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

/**
 * Recovers all unfinished workflows during orchestrator startup.
 */
export async function recoverUnfinishedWorkflows(): Promise<void> {
  log.info("Checking for unfinished workflows to recover...");
  try {
    const result = await pool.query(
      `SELECT order_id, state, context, version FROM purchase_workflows WHERE state NOT IN ($1, $2)`,
      ["Completed", "Refunded"]
    );

    if (result.rows.length === 0) {
      log.info("No unfinished workflows found for recovery.");
      return;
    }

    log.info(`Found ${result.rows.length} unfinished workflows to recover.`);
    for (const row of result.rows) {
      const orderId = row.order_id;
      const state = row.state;
      const context = typeof row.context === "string" ? JSON.parse(row.context) : row.context;
      log.info("Recovering workflow", { orderId, state, version: row.version });
      // In a real system, we'd spawn or re-initiate the workflow actor in the orchestrator memory.
    }
  } catch (err) {
    log.error("Error recovering unfinished workflows", {
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
