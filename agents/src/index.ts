/**
 * @delego/agents — Entry point
 * Issues #8, #9: LLM runtimes and tool registry exported from this package.
 */
import { createLogger } from "@delego/utils";
import { startHttpServer } from "@delego/utils";

// Issue #9: LLM client runtimes
export { OpenAIClient, AnthropicClient } from "./llm/index.js";
export type { LLMClient, LLMRequestOptions, LLMResponse } from "./llm/index.js";

// Issue #8: Tool execution registry
export { ToolRegistry } from "./tools/index.js";
export type { ToolSchema, ToolHandler, ToolExecutionLog } from "./tools/index.js";

const SERVICE_NAME = "agents";
const DEFAULT_PORT = 3011;

const nodeEnv = process.env.NODE_ENV ?? "development";
const logLevel = process.env.LOG_LEVEL ?? "info";
const log = createLogger(SERVICE_NAME, logLevel);
const port = Number(process.env.AGENTS_PORT ?? DEFAULT_PORT);

log.info("Starting service", { port, nodeEnv });

startHttpServer({
  port,
  serviceName: SERVICE_NAME,
  routes: [],
});

// TODO: Wire routes, database, and domain logic
