import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  CheckoutWorkflow,
  emittedEvents,
  clearEmittedEvents,
} from "../../../apps/backend/orchestrator/dist/workflows/checkout/index.js";

describe("Checkout Workflow State Machine", () => {
  beforeEach(() => {
    clearEmittedEvents();
  });

  it("should successfully run the full happy path", () => {
    const orderId = "order_happy_123";
    const wf = new CheckoutWorkflow(orderId);

    // Initial state check
    assert.equal(wf.state, "initiated");
    assert.equal(wf.orderId, orderId);
    assert.equal(wf.cancellationReason, undefined);

    // Transitions
    wf.transitionTo("pending_approval");
    assert.equal(wf.state, "pending_approval");

    wf.transitionTo("approved");
    assert.equal(wf.state, "approved");

    wf.transitionTo("funding");
    assert.equal(wf.state, "funding");

    wf.transitionTo("completed");
    assert.equal(wf.state, "completed");

    // Check emitted events
    assert.equal(emittedEvents.length, 5);
    assert.equal(emittedEvents[0].type, "checkout_initiated");
    assert.equal(emittedEvents[0].payload.fromState, "initiated");
    assert.equal(emittedEvents[0].payload.toState, "initiated");

    assert.equal(emittedEvents[1].type, "checkout_pending_approval");
    assert.equal(emittedEvents[1].payload.fromState, "initiated");
    assert.equal(emittedEvents[1].payload.toState, "pending_approval");

    assert.equal(emittedEvents[2].type, "checkout_approved");
    assert.equal(emittedEvents[2].payload.fromState, "pending_approval");
    assert.equal(emittedEvents[2].payload.toState, "approved");

    assert.equal(emittedEvents[3].type, "checkout_funding");
    assert.equal(emittedEvents[3].payload.fromState, "approved");
    assert.equal(emittedEvents[3].payload.toState, "funding");

    assert.equal(emittedEvents[4].type, "checkout_completed");
    assert.equal(emittedEvents[4].payload.fromState, "funding");
    assert.equal(emittedEvents[4].payload.toState, "completed");
  });

  describe("Cancellation Paths", () => {
    const cancellationReasons = [
      "user_rejected",
      "approval_timeout",
      "funding_failed",
      "merchant_unavailable",
      "system_error",
    ];

    cancellationReasons.forEach((reason) => {
      it(`should successfully cancel from initiated state with reason: ${reason}`, () => {
        const wf = new CheckoutWorkflow("order_init_cancel");
        wf.transitionTo("cancelled", reason);

        assert.equal(wf.state, "cancelled");
        assert.equal(wf.cancellationReason, reason);

        // Verify emitted events
        assert.equal(emittedEvents.length, 2);
        assert.equal(emittedEvents[1].type, "checkout_cancelled");
        assert.equal(emittedEvents[1].payload.fromState, "initiated");
        assert.equal(emittedEvents[1].payload.toState, "cancelled");
        assert.equal(emittedEvents[1].payload.cancellationReason, reason);
      });

      it(`should successfully cancel from pending_approval state with reason: ${reason}`, () => {
        const wf = new CheckoutWorkflow("order_pending_cancel");
        wf.transitionTo("pending_approval");
        wf.transitionTo("cancelled", reason);

        assert.equal(wf.state, "cancelled");
        assert.equal(wf.cancellationReason, reason);

        // Verify emitted events
        assert.equal(emittedEvents.length, 3);
        assert.equal(emittedEvents[2].type, "checkout_cancelled");
        assert.equal(emittedEvents[2].payload.fromState, "pending_approval");
        assert.equal(emittedEvents[2].payload.toState, "cancelled");
        assert.equal(emittedEvents[2].payload.cancellationReason, reason);
      });

      it(`should successfully cancel from approved state with reason: ${reason}`, () => {
        const wf = new CheckoutWorkflow("order_approved_cancel");
        wf.transitionTo("pending_approval");
        wf.transitionTo("approved");
        wf.transitionTo("cancelled", reason);

        assert.equal(wf.state, "cancelled");
        assert.equal(wf.cancellationReason, reason);

        // Verify emitted events
        assert.equal(emittedEvents.length, 4);
        assert.equal(emittedEvents[3].type, "checkout_cancelled");
        assert.equal(emittedEvents[3].payload.fromState, "approved");
        assert.equal(emittedEvents[3].payload.toState, "cancelled");
        assert.equal(emittedEvents[3].payload.cancellationReason, reason);
      });

      it(`should successfully cancel from funding state with reason: ${reason}`, () => {
        const wf = new CheckoutWorkflow("order_funding_cancel");
        wf.transitionTo("pending_approval");
        wf.transitionTo("approved");
        wf.transitionTo("funding");
        wf.transitionTo("cancelled", reason);

        assert.equal(wf.state, "cancelled");
        assert.equal(wf.cancellationReason, reason);

        // Verify emitted events
        assert.equal(emittedEvents.length, 5);
        assert.equal(emittedEvents[4].type, "checkout_cancelled");
        assert.equal(emittedEvents[4].payload.fromState, "funding");
        assert.equal(emittedEvents[4].payload.toState, "cancelled");
        assert.equal(emittedEvents[4].payload.cancellationReason, reason);
      });
    });
  });

  describe("Validation & Errors", () => {
    it("should throw error if cancellation reason is missing", () => {
      const wf = new CheckoutWorkflow("order_missing_reason");
      assert.throws(() => {
        wf.transitionTo("cancelled");
      }, /Cancellation reason is required/);
    });

    it("should throw error if cancellation reason is invalid", () => {
      const wf = new CheckoutWorkflow("order_invalid_reason");
      assert.throws(() => {
        wf.transitionTo("cancelled", "some_random_reason");
      }, /Invalid cancellation reason/);
    });

    it("should throw error for invalid transitions", () => {
      const wf = new CheckoutWorkflow("order_invalid_transition");
      // initiated -> approved (invalid, must go to pending_approval first)
      assert.throws(() => {
        wf.transitionTo("approved");
      }, /Invalid state transition/);
    });

    it("should throw error when transitioning from terminal completed state", () => {
      const wf = new CheckoutWorkflow("order_terminal_completed");
      wf.transitionTo("pending_approval");
      wf.transitionTo("approved");
      wf.transitionTo("funding");
      wf.transitionTo("completed");

      assert.throws(() => {
        wf.transitionTo("cancelled", "system_error");
      }, /Cannot transition from terminal state/);
    });

    it("should throw error when transitioning from terminal cancelled state", () => {
      const wf = new CheckoutWorkflow("order_terminal_cancelled");
      wf.transitionTo("cancelled", "user_rejected");

      assert.throws(() => {
        wf.transitionTo("pending_approval");
      }, /Cannot transition from terminal state/);
    });
  });
});
