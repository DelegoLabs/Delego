/**
 * @delego/orchestrator — Workflow coordination
 */
import { createLogger, startHttpServer } from "@delego/utils";
import { purchaseWorkflow } from "../workflows/purchase/index.js";

const SERVICE_NAME = "orchestrator";
const DEFAULT_PORT = 3010;

const logLevel = process.env.LOG_LEVEL ?? "info";
const log = createLogger(SERVICE_NAME, logLevel);
const port = Number(process.env.ORCHESTRATOR_PORT ?? DEFAULT_PORT);

log.info("Starting orchestrator", { port });

startHttpServer({
  port,
  serviceName: SERVICE_NAME,
  routes: [
    // TODO: Register workflow trigger endpoints
  ],
});

// Export workflows and state machine for internal use (issue #7)
export { purchaseWorkflow, restorePurchaseWorkflow } from "../workflows/purchase/index.js";
export { PurchaseWorkflowMachine } from "../state/index.js";
export type { WorkflowSnapshot, PurchaseState, PurchaseEvent } from "../state/index.js";
