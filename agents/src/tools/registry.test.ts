import { describe, it, expect } from "vitest";
import { ToolRegistry } from "./registry.js";

describe("ToolRegistry", () => {
  it("registers and lists tools", () => {
    const registry = new ToolRegistry();
    registry.register(
      { name: "echo", description: "Echo input", parameters: { type: "object", properties: { msg: { type: "string" } } } },
      async (input) => input
    );

    const tools = registry.listTools();
    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe("echo");
  });

  it("executes a registered tool successfully", async () => {
    const registry = new ToolRegistry();
    registry.register(
      { name: "double", description: "Double the value", parameters: { type: "object", properties: { x: { type: "number" } } } },
      async (input) => (input as { x: number }).x * 2,
    );

    const result = await registry.execute("double", { x: 5 });
    expect(result).toBe(10);
  });

  it("throws on unknown tool", async () => {
    const registry = new ToolRegistry();
    await expect(registry.execute("nonexistent", {})).rejects.toThrow("Unknown tool");
  });

  it("throws on duplicate registration", () => {
    const registry = new ToolRegistry();
    registry.register(
      { name: "dup", description: "first", parameters: { type: "object" } },
      async () => "a",
    );
    expect(() =>
      registry.register(
        { name: "dup", description: "second", parameters: { type: "object" } },
        async () => "b",
      ),
    ).toThrow("already registered");
  });

  it("throws on invalid input per schema", async () => {
    const registry = new ToolRegistry();
    registry.register(
      {
        name: "greet",
        description: "Greet a person",
        parameters: {
          type: "object",
          required: ["name"],
          properties: { name: { type: "string" } },
        },
      },
      async (input) => `Hello, ${(input as { name: string }).name}`,
    );

    await expect(registry.execute("greet", {})).rejects.toThrow("missing required field");
  });

  it("maintains audit log for each execution", async () => {
    const registry = new ToolRegistry();
    registry.register(
      { name: "ping", description: "Returns pong", parameters: { type: "object" } },
      async () => "pong",
    );

    await registry.execute("ping", {});
    const log = registry.getAuditLog();
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ toolName: "ping", success: true, output: "pong" });
    expect(log[0].durationMs).toBeGreaterThanOrEqual(0);
    expect(typeof log[0].executedAt).toBe("string");
  });

  it("records audit log on failure", async () => {
    const registry = new ToolRegistry();
    registry.register(
      { name: "fail", description: "Always fails", parameters: { type: "object" } },
      async () => { throw new Error("oops"); },
    );

    await expect(registry.execute("fail", {})).rejects.toThrow("oops");
    const log = registry.getAuditLog();
    expect(log).toHaveLength(1);
    expect(log[0].success).toBe(false);
    expect(log[0].error).toBe("oops");
  });
});