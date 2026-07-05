import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { SagaCoordinator } from "../../../apps/backend/orchestrator/dist/src/saga/coordinator.js";
import { InMemorySagaStore } from "../../../apps/backend/orchestrator/dist/src/saga/memory-store.js";

function makeStep(name, { failAction = false, failCompensation = false } = {}) {
  const actionCalls = [];
  const compensationCalls = [];
  return {
    name,
    actionCalls,
    compensationCalls,
    async action(context) {
      actionCalls.push(context);
      if (failAction) throw new Error(`${name} action failed`);
      return { ...context, [`${name}Done`]: true };
    },
    async compensation(context, error) {
      compensationCalls.push({ context, error });
      if (failCompensation) throw new Error(`${name} compensation failed`);
      return { ...context, [`${name}Done`]: false };
    },
  };
}

describe("SagaCoordinator", () => {
  it("runs all steps in order and marks the saga completed", async () => {
    const stepA = makeStep("a");
    const stepB = makeStep("b");
    const store = new InMemorySagaStore();
    const coordinator = new SagaCoordinator({ steps: [stepA, stepB], store });

    const result = await coordinator.run("saga-1", "order-1", {});

    assert.equal(result.status, "completed");
    assert.deepEqual(result.completedSteps, ["a", "b"]);
    assert.equal(stepA.actionCalls.length, 1);
    assert.equal(stepB.actionCalls.length, 1);
  });

  it("compensates completed steps in reverse order when a later step fails", async () => {
    const stepA = makeStep("a");
    const stepB = makeStep("b", { failAction: true });
    const store = new InMemorySagaStore();
    const coordinator = new SagaCoordinator({ steps: [stepA, stepB], store });

    const result = await coordinator.run("saga-2", "order-2", {});

    assert.equal(result.status, "failed");
    assert.deepEqual(result.completedSteps, []);
    assert.equal(stepA.compensationCalls.length, 1, "step a's compensation must run since it completed");
    assert.equal(stepB.compensationCalls.length, 0, "step b never completed, so it has nothing to compensate");
    assert.equal(stepA.compensationCalls[0].error.message, "b action failed");
  });

  it("run() is idempotent — resuming an already-started saga skips completed steps", async () => {
    const stepA = makeStep("a");
    const stepB = makeStep("b");
    const store = new InMemorySagaStore();
    const coordinator = new SagaCoordinator({ steps: [stepA, stepB], store });

    await coordinator.run("saga-3", "order-3", {});
    const second = await coordinator.run("saga-3", "order-3", {});

    assert.equal(second.status, "completed");
    assert.equal(stepA.actionCalls.length, 1, "second run() must not re-execute a completed step");
    assert.equal(stepB.actionCalls.length, 1);
  });

  it("resume() continues a saga left compensating after a simulated crash", async () => {
    const stepA = makeStep("a");
    const stepB = makeStep("b", { failAction: true });
    const store = new InMemorySagaStore();
    const coordinator = new SagaCoordinator({ steps: [stepA, stepB], store });

    await coordinator.run("saga-4", "order-4", {});
    assert.equal(stepA.compensationCalls.length, 1);

    // A fresh coordinator instance (simulating a restarted process) resuming from the
    // persisted store must not re-run compensation for a step already rolled back.
    const recoveredCoordinator = new SagaCoordinator({ steps: [stepA, stepB], store });
    const resumed = await recoveredCoordinator.resume("saga-4");

    assert.equal(resumed.status, "failed");
    assert.equal(stepA.compensationCalls.length, 1, "resume() must not re-run an already-compensated step");
  });

  it("propagates compensation failures and leaves the saga in compensating state for retry", async () => {
    const stepA = makeStep("a", { failCompensation: true });
    const stepB = makeStep("b", { failAction: true });
    const store = new InMemorySagaStore();
    const coordinator = new SagaCoordinator({ steps: [stepA, stepB], store });

    await assert.rejects(() => coordinator.run("saga-5", "order-5", {}), /a compensation failed/);

    const record = await store.get("saga-5");
    assert.equal(record.status, "compensating");
    assert.deepEqual(record.completedSteps, ["a"], "step a's failed compensation must not be marked rolled back");
  });

  it("recoverAll() retries a saga left compensating after a transient compensation failure", async () => {
    const actionCalls = [];
    const compensationCalls = [];
    let compensationAttempts = 0;
    const stepA = {
      name: "a",
      async action(context) {
        actionCalls.push(context);
        return context;
      },
      async compensation(context, error) {
        compensationCalls.push({ context, error });
        compensationAttempts += 1;
        if (compensationAttempts === 1) throw new Error("downstream temporarily unavailable");
        return context;
      },
    };
    const stepB = makeStep("b", { failAction: true });
    const store = new InMemorySagaStore();
    const coordinator = new SagaCoordinator({ steps: [stepA, stepB], store });

    await assert.rejects(() => coordinator.run("saga-6", "order-6", {}));

    let record = await store.get("saga-6");
    assert.equal(record.status, "compensating", "saga must stay compensating after a failed compensation attempt");

    // A fresh coordinator instance (simulating an orchestrator restart) retries the
    // still-pending compensation instead of leaving the saga stuck.
    const recoveredCoordinator = new SagaCoordinator({ steps: [stepA, stepB], store });
    await recoveredCoordinator.recoverAll();

    record = await store.get("saga-6");
    assert.equal(record.status, "failed");
    assert.equal(compensationCalls.length, 2, "compensation should be retried on recovery");
  });
});
