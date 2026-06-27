import { describe, it, expect, beforeEach } from "vitest";
import {
  createWorkflowCorrelationId,
  createWorkflowEventEnvelope,
  publishWorkflowEvent,
  clearPublishedWorkflowEvents,
  publishedWorkflowEvents,
} from "../src/workflow-events.js";
import { CheckoutWorkflow, clearEmittedEvents } from "./checkout/index.js";

describe("workflow event correlation id", () => {
  beforeEach(() => {
    clearEmittedEvents();
    clearPublishedWorkflowEvents();
  });

  it("generates a correlation id at workflow creation", () => {
    const wf = new CheckoutWorkflow("ord-corr-1");
    expect(wf.correlationId).toMatch(/^[a-zA-Z0-9_-]+$/);
  });

  it("propagates the same correlation id across checkout transitions", () => {
    const wf = new CheckoutWorkflow("ord-corr-2");
    const correlationId = wf.correlationId;

    wf.transitionTo("pending_approval");
    wf.transitionTo("approved");

    const correlationIds = new Set(
      publishedWorkflowEvents.map((event) => event.correlationId)
    );

    expect(correlationIds.size).toBe(1);
    expect(correlationIds.has(correlationId)).toBe(true);
    expect(publishedWorkflowEvents.every((event) => event.orderId === "ord-corr-2")).toBe(
      true
    );
  });

  it("keeps correlation ids independent across separate workflows", () => {
    const first = new CheckoutWorkflow("ord-a");
    const second = new CheckoutWorkflow("ord-b");

    expect(first.correlationId).not.toBe(second.correlationId);
  });

  it("publishes envelopes with the required fields", () => {
    const correlationId = createWorkflowCorrelationId();
    const envelope = createWorkflowEventEnvelope(correlationId, "ord-1", "checkout_initiated", {
      fromState: "initiated",
      toState: "initiated",
    });

    publishWorkflowEvent(envelope);

    expect(publishedWorkflowEvents).toHaveLength(1);
    expect(publishedWorkflowEvents[0]).toEqual(envelope);
    expect(envelope.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
