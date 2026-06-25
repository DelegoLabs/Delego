import { describe, it, expect } from "vitest";
import { routeContractEvent } from "./router.js";

describe("routeContractEvent", () => {
  it("routes escrow.released to escrow-released template on email and push", () => {
    const route = routeContractEvent("escrow.released");
    expect(route).not.toBeNull();
    expect(route?.templateName).toBe("escrow-released");
    expect(route?.channels).toContain("email");
    expect(route?.channels).toContain("push");
  });

  it("routes escrow.locked to approval-request template", () => {
    const route = routeContractEvent("escrow.locked");
    expect(route?.templateName).toBe("approval-request");
  });

  it("routes payment.failed to email only", () => {
    const route = routeContractEvent("payment.failed");
    expect(route?.templateName).toBe("payment-failed");
    expect(route?.channels).toEqual(["email"]);
  });

  it("routes permission.granted to push only", () => {
    const route = routeContractEvent("permission.granted");
    expect(route?.channels).toEqual(["push"]);
  });

  it("routes permission.revoked to push only", () => {
    const route = routeContractEvent("permission.revoked");
    expect(route?.channels).toEqual(["push"]);
  });

  it("returns null for an unsupported event type", () => {
    expect(routeContractEvent("unknown.event")).toBeNull();
  });

  it("returns null for an empty string event type", () => {
    expect(routeContractEvent("")).toBeNull();
  });
});
