import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { z } from "zod";
import {
  MerchantProfileUpdateSchema,
  PROTECTED_MERCHANT_FIELDS,
  ProtectedFieldError,
  detectProtectedFields,
  parseMerchantProfileUpdate,
} from "./merchantProfile";

describe("MerchantProfileUpdateSchema", () => {
  it("accepts a payload of only approved public profile fields", () => {
    const payload = {
      displayName: "Acme Groceries",
      description: "Fresh produce, delivered by your agent.",
      supportEmail: "support@acme.test",
      webhookUrl: "https://hooks.acme.test/delego",
    };

    const result = MerchantProfileUpdateSchema.safeParse(payload);

    expect(result.success).toBe(true);
  });

  it("accepts an empty payload and an empty string description", () => {
    expect(MerchantProfileUpdateSchema.safeParse({}).success).toBe(true);
    expect(
      MerchantProfileUpdateSchema.safeParse({ description: "" }).success
    ).toBe(true);
  });

  it("rejects unknown non-whitelisted fields", () => {
    const result = MerchantProfileUpdateSchema.safeParse({
      displayName: "Acme",
      newsletterOptIn: true,
    });

    expect(result.success).toBe(false);
  });

  it("rejects invalid values for whitelisted fields", () => {
    expect(
      MerchantProfileUpdateSchema.safeParse({ displayName: "" }).success
    ).toBe(false);
    expect(
      MerchantProfileUpdateSchema.safeParse({ supportEmail: "not-an-email" })
        .success
    ).toBe(false);
    expect(
      MerchantProfileUpdateSchema.safeParse({ webhookUrl: "not a url" }).success
    ).toBe(false);
    expect(
      MerchantProfileUpdateSchema.safeParse({ description: "x".repeat(1001) })
        .success
    ).toBe(false);
  });

  it("is strict: system-managed fields are rejected as unknown keys", () => {
    for (const field of ["isVerified", "feeBps", "reputationScore"]) {
      const result = MerchantProfileUpdateSchema.safeParse({
        displayName: "Acme",
        [field]: field === "isVerified" ? true : 1,
      });

      expect(result.success).toBe(false);
    }
  });
});

describe("detectProtectedFields", () => {
  it("flags every privileged field present in the payload", () => {
    expect(
      detectProtectedFields({
        displayName: "Acme",
        isVerified: true,
        feeBps: 0,
        reputationScore: 100,
      })
    ).toEqual(["isVerified", "feeBps", "reputationScore"]);
  });

  it("flags all protected fields regardless of value shape", () => {
    const payload: Record<string, unknown> = {};
    for (const field of PROTECTED_MERCHANT_FIELDS) {
      payload[field] = null;
    }

    expect(detectProtectedFields(payload)).toEqual([
      ...PROTECTED_MERCHANT_FIELDS,
    ]);
  });

  it("returns an empty list for payloads with only whitelisted fields", () => {
    expect(detectProtectedFields({ displayName: "Acme" })).toEqual([]);
  });

  it("returns an empty list for non-object payloads", () => {
    expect(detectProtectedFields(null)).toEqual([]);
    expect(detectProtectedFields("isVerified=true")).toEqual([]);
    expect(detectProtectedFields(["isVerified"])).toEqual([]);
    expect(detectProtectedFields(42)).toEqual([]);
  });
});

describe("parseMerchantProfileUpdate", () => {
  it("returns the parsed, whitelisted data on valid payloads", () => {
    const result = parseMerchantProfileUpdate({
      displayName: "  Acme  ",
      description: "Fresh produce.",
    });

    expect(result).toEqual({
      ok: true,
      data: { displayName: "  Acme  ", description: "Fresh produce." },
    });
  });

  it("rejects system-managed fields with HTTP 400 semantics", () => {
    const result = parseMerchantProfileUpdate({
      displayName: "Acme",
      isVerified: true,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(ProtectedFieldError);
      expect((result.error as ProtectedFieldError).status).toBe(400);
      expect((result.error as ProtectedFieldError).fields).toEqual([
        "isVerified",
      ]);
      expect(result.error.message).toContain("isVerified");
    }
  });

  it("rejects feeBps and reputationScore attempts with HTTP 400 semantics", () => {
    for (const field of ["feeBps", "reputationScore"]) {
      const result = parseMerchantProfileUpdate({ [field]: 1 });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(ProtectedFieldError);
        expect((result.error as ProtectedFieldError).fields).toEqual([field]);
      }
    }
  });

  it("rejects unknown non-privileged fields with a ZodError", () => {
    const result = parseMerchantProfileUpdate({ hax: "x" });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(z.ZodError);
    }
  });
});

describe("updateMerchantProfile", () => {
  const MERCHANT_ID = "merchant-123";
  const originalEnv = process.env;

  // createRetryingFetch captures global fetch at module load, so the module
  // must be (re)imported AFTER the stub is in place — same pattern as
  // lib/api.test.ts.
  async function loadModuleWithFetch(fetchMock: ReturnType<typeof vi.fn>) {
    vi.stubGlobal("fetch", fetchMock);
    return await import("./merchantProfile");
  }

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv, NEXT_PUBLIC_API_URL: "https://api.example.com" };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.unstubAllGlobals();
  });

  it("serializes exactly the whitelisted fields for a valid payload", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    const { updateMerchantProfile } = await loadModuleWithFetch(fetchMock);

    await updateMerchantProfile(MERCHANT_ID, {
      displayName: "Acme Groceries",
      supportEmail: "support@acme.test",
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.example.com/merchants/merchant-123");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body as string)).toEqual({
      displayName: "Acme Groceries",
      supportEmail: "support@acme.test",
    });
  });

  it("rejects a payload mixing valid and privileged fields without sending it", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    const { updateMerchantProfile, ProtectedFieldError: PFE } =
      await loadModuleWithFetch(fetchMock);

    // Privileged fields mixed into an otherwise valid payload must abort
    // the request outright, never be serialized into the body.
    await expect(
      updateMerchantProfile(MERCHANT_ID, {
        displayName: "Acme Groceries",
        isVerified: true as unknown as never,
        feeBps: 0 as unknown as never,
        reputationScore: 100 as unknown as never,
      })
    ).rejects.toBeInstanceOf(PFE);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses to send a request when privileged fields are present", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    const { updateMerchantProfile, ProtectedFieldError: PFE } =
      await loadModuleWithFetch(fetchMock);

    await expect(
      updateMerchantProfile(MERCHANT_ID, { isVerified: true })
    ).rejects.toBeInstanceOf(PFE);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses to send a request when unknown fields are present", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    const { updateMerchantProfile } = await loadModuleWithFetch(fetchMock);

    await expect(
      updateMerchantProfile(MERCHANT_ID, { displayName: "Acme", hax: 1 })
    ).rejects.toMatchObject({ name: "ZodError" });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("URL-encodes the merchant id", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    const { updateMerchantProfile } = await loadModuleWithFetch(fetchMock);

    await updateMerchantProfile("merchant/../admin", { displayName: "Acme" });

    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://api.example.com/merchants/merchant%2F..%2Fadmin"
    );
  });

  it("throws on a non-2xx response", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 403 });
    const { updateMerchantProfile } = await loadModuleWithFetch(fetchMock);

    await expect(
      updateMerchantProfile(MERCHANT_ID, { displayName: "Acme" })
    ).rejects.toThrow("403");
  });
});
