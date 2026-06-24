/**
 * @delego/orchestrator — Workflow coordination
 */
import { createLogger, startHttpServer } from "@delego/utils";
import { purchaseWorkflow } from "../workflows/purchase/index.js";
import { connectDb, persistWorkflowState, recoverWorkflowState } from "./persistence.js";

const SERVICE_NAME = "orchestrator";
const DEFAULT_PORT = 3010;

const logLevel = process.env.LOG_LEVEL ?? "info";
const log = createLogger(SERVICE_NAME, logLevel);
const port = Number(process.env.ORCHESTRATOR_PORT ?? DEFAULT_PORT);

log.info("Starting orchestrator", { port });

await connectDb();

startHttpServer({
  port,
  serviceName: SERVICE_NAME,
  routes: [
    // TODO: Register workflow trigger endpoints
  ],
});

// Export workflows and persistence helpers for internal use
export { purchaseWorkflow, persistWorkflowState, recoverWorkflowState };
