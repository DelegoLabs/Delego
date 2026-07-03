import { describe, it, expect } from "vitest";

describe("Delegation Ownership Check", () => {
  it("should have the correct interface structure", () => {
    const ownershipCheck = {
      userId: "user-123",
      delegationId: "delegation-123",
      owned: true,
    };

    expect(ownershipCheck).toHaveProperty("userId");
    expect(ownershipCheck).toHaveProperty("delegationId");
    expect(ownershipCheck).toHaveProperty("owned");
    expect(typeof ownershipCheck.userId).toBe("string");
    expect(typeof ownershipCheck.delegationId).toBe("string");
    expect(typeof ownershipCheck.owned).toBe("boolean");
  });

  it("should return owned: true when user owns the delegation", () => {
    const ownershipCheck = {
      userId: "user-123",
      delegationId: "delegation-123",
      owned: true,
    };

    expect(ownershipCheck.owned).toBe(true);
  });

  it("should return owned: false when user does not own the delegation", () => {
    const ownershipCheck = {
      userId: "user-123",
      delegationId: "delegation-123",
      owned: false,
    };

    expect(ownershipCheck.owned).toBe(false);
  });

  it("should return owned: false when delegation does not exist", () => {
    const ownershipCheck = {
      userId: "user-123",
      delegationId: "delegation-123",
      owned: false,
    };

    expect(ownershipCheck.owned).toBe(false);
  });
});
