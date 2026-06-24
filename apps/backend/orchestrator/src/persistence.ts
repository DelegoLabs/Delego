import { Client } from "pg";
import { createLogger } from "@delego/utils";

const log = createLogger("orchestrator:db", process.env.LOG_LEVEL ?? "info");
const databaseUrl = process.env.DATABASE_URL ?? "postgresql://delego:delego@localhost:5432/delego";

let client: Client | null = null;

export interface WorkflowSnapshot {
  orderId: string;
  userId: string;
  state: string;
  context: Record<string, unknown>;
  updatedAt: string;
}

export async function getDbClient(): Promise<Client> {
  if (!client) {
    client = new Client({ connectionString: databaseUrl });
    await client.connect();
    log.info("Connected to PostgreSQL for orchestrator workflow persistence.");
  }

  return client;
}

export async function persistWorkflowState(
  orderId: string,
  userId: string,
  state: string,
  context: object
): Promise<void> {
  const db = await getDbClient();

  await db.query(
    `INSERT INTO purchase_workflows (order_id, user_id, state, context, updated_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (order_id)
     DO UPDATE SET user_id = EXCLUDED.user_id,
                   state = EXCLUDED.state,
                   context = EXCLUDED.context,
                   updated_at = NOW()`,
    [orderId, userId, state, context]
  );
}

export async function recoverWorkflowState(
  orderId: string
): Promise<{ state: string; context: object }> {
  const db = await getDbClient();

  const result = await db.query(
    `SELECT state, context FROM purchase_workflows WHERE order_id = $1`,
    [orderId]
  );

  if (result.rowCount === 0) {
    throw new Error(`Workflow state not found for orderId ${orderId}`);
  }

  return {
    state: result.rows[0].state as string,
    context: result.rows[0].context as object,
  };
}
