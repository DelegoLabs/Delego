/** AI Agent Tool Execution Registry (issue #8). */

export interface ToolSchema {
  name: string;
  description: string;
  /** JSON Schema (draft-07) describing the expected input object. */
  parameters: Record<string, unknown>;
}

export type ToolHandler<TInput = Record<string, unknown>, TOutput = unknown> = (
  input: TInput
) => Promise<TOutput>;

export interface ToolExecutionLog {
  toolName: string;
  input: unknown;
  output: unknown;
  success: boolean;
  error?: string;
  durationMs: number;
  executedAt: string;
}

interface RegisteredTool {
  schema: ToolSchema;
  handler: ToolHandler;
}

/** Minimal JSON Schema type validator (subset of draft-07). */
function validateInput(
  input: unknown,
  schema: Record<string, unknown>
): string | null {
  if (schema["type"] === "object") {
    if (typeof input !== "object" || input === null || Array.isArray(input)) {
      return "input must be an object";
    }

    const required = (schema["required"] as string[] | undefined) ?? [];
    const inputObj = input as Record<string, unknown>;

    for (const key of required) {
      if (!(key in inputObj)) {
        return `missing required field: ${key}`;
      }
    }

    const properties = (schema["properties"] as Record<string, { type?: string }> | undefined) ?? {};
    for (const [key, propSchema] of Object.entries(properties)) {
      if (!(key in inputObj)) continue;
      const value = inputObj[key];
      if (propSchema.type && typeof value !== propSchema.type) {
        return `field "${key}" must be of type ${propSchema.type}, got ${typeof value}`;
      }
    }
  }

  if (schema["type"] && schema["type"] !== "object") {
    if (typeof input !== schema["type"]) {
      return `input must be of type ${schema["type"]}`;
    }
  }

  return null;
}

/**
 * Central registry of tools the LLM agent can invoke.
 *
 * Responsibilities:
 *  - Schema validation of inputs before execution.
 *  - Isolation: each handler runs inside a try/catch boundary so one
 *    tool failure cannot crash the agent loop.
 *  - Audit logging of every invocation (success or failure).
 */
export class ToolRegistry {
  private readonly tools = new Map<string, RegisteredTool>();
  private readonly auditLog: ToolExecutionLog[] = [];

  register<TInput extends Record<string, unknown>>(
    schema: ToolSchema,
    handler: ToolHandler<TInput>
  ): void {
    if (this.tools.has(schema.name)) {
      throw new Error(`Tool "${schema.name}" is already registered`);
    }
    this.tools.set(schema.name, {
      schema,
      handler: handler as ToolHandler,
    });
  }

  async execute(toolName: string, input: unknown): Promise<unknown> {
    const registered = this.tools.get(toolName);
    if (!registered) {
      throw new Error(`Unknown tool: "${toolName}"`);
    }

    const validationError = validateInput(
      input,
      registered.schema.parameters
    );
    if (validationError) {
      throw new Error(
        `Invalid input for tool "${toolName}": ${validationError}`
      );
    }

    const start = Date.now();
    let output: unknown = null;
    let success = false;
    let errorMessage: string | undefined;

    try {
      output = await registered.handler(input as Record<string, unknown>);
      success = true;
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : String(err);
      throw err;
    } finally {
      const log: ToolExecutionLog = {
        toolName,
        input,
        output,
        success,
        durationMs: Date.now() - start,
        executedAt: new Date().toISOString(),
      };
      if (errorMessage) log.error = errorMessage;
      this.auditLog.push(log);
    }

    return output;
  }

  listTools(): ToolSchema[] {
    return Array.from(this.tools.values()).map((t) => t.schema);
  }

  /** Returns a copy of all execution logs for auditing dashboards. */
  getAuditLog(): ToolExecutionLog[] {
    return [...this.auditLog];
  }
}
