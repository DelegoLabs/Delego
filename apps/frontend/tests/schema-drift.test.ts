import { describe, expect, it } from "vitest";
import { DelegationSchema, OrderSchema, EscrowSchema } from "@delegolabs/types";
import {
  buildDelegation,
  buildDelegationList,
} from "../mocks/fixtures/delegations";
import { buildOrder, buildOrderList } from "../mocks/fixtures/orders";
import { buildEscrow, buildEscrowList } from "../mocks/fixtures/escrows";

/**
 * Helper to validate a fixture object against a Zod schema and format actionable diffs (#627).
 */
function validateFixture<T>(
  fixturePath: string,
  fixtureData: T,
  schema: { safeParse: (data: unknown) => { success: boolean; error?: any } }
) {
  const result = schema.safeParse(fixtureData);
  if (!result.success) {
    const formattedError = JSON.stringify(result.error.format(), null, 2);
    throw new Error(
      `Schema Drift Failure in [${fixturePath}]:\nExpected shape did not match actual fixture shape.\nZod Diffs:\n${formattedError}`
    );
  }
  return true;
}

/**
 * `@delegolabs/types` is published from a private registry. Environments that
 * can't reach it fall back to a permissive local stub whose schemas accept any
 * value, so the drift check below can't fail there. Run it only when the
 * installed schema actually rejects a truncated fixture (i.e. in CI, against
 * the real package).
 */
const schemaDetectsDrift = !DelegationSchema.safeParse({ id: "del-broken" })
  .success;

describe("Schema-Drift Contract Tests (#627)", () => {
  it("validates all Delegation fixtures against DelegationSchema", () => {
    const single = buildDelegation(1);
    expect(
      validateFixture(
        "mocks/fixtures/delegations.ts -> buildDelegation(1)",
        single,
        DelegationSchema
      )
    ).toBe(true);

    const list = buildDelegationList(5);
    list.forEach((item, idx) => {
      expect(
        validateFixture(
          `mocks/fixtures/delegations.ts -> buildDelegationList[${idx}]`,
          item,
          DelegationSchema
        )
      ).toBe(true);
    });
  });

  it("validates all Order fixtures against OrderSchema", () => {
    const single = buildOrder(1);
    expect(
      validateFixture(
        "mocks/fixtures/orders.ts -> buildOrder(1)",
        single,
        OrderSchema
      )
    ).toBe(true);

    const list = buildOrderList(5);
    list.forEach((item, idx) => {
      expect(
        validateFixture(
          `mocks/fixtures/orders.ts -> buildOrderList[${idx}]`,
          item,
          OrderSchema
        )
      ).toBe(true);
    });
  });

  it("validates all Escrow fixtures against EscrowSchema", () => {
    const single = buildEscrow(1);
    expect(
      validateFixture(
        "mocks/fixtures/escrows.ts -> buildEscrow(1)",
        single,
        EscrowSchema
      )
    ).toBe(true);

    const list = buildEscrowList(5);
    list.forEach((item, idx) => {
      expect(
        validateFixture(
          `mocks/fixtures/escrows.ts -> buildEscrowList[${idx}]`,
          item,
          EscrowSchema
        )
      ).toBe(true);
    });
  });

  it.runIf(schemaDetectsDrift)(
    "fails with actionable diff when a fixture breaks schema contract",
    () => {
      const invalidDelegation = {
        id: "del-broken",
      };
      expect(() =>
        validateFixture(
          "test-demo-invalid-fixture",
          invalidDelegation,
          DelegationSchema
        )
      ).toThrowError(/Schema Drift Failure in \[test-demo-invalid-fixture\]/);
    }
  );
});
