import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import {
  verifyToken,
  getJwtValidationConfig,
} from "../../../apps/backend/gateway/dist/src/auth/authService.js";

// Must match the default used in authService.ts when JWT_SECRET is unset.
const JWT_SECRET = process.env.JWT_SECRET ?? "change-me-in-production";

/**
 * Helper: sign a token with explicit numeric `iat`, `nbf`, `exp` claims so we
 * can deterministically simulate just-expired / too-expired / not-before
 * scenarios without relying on real wall-clock waits.
 */
function signWithClaims({
  userId = "test-user",
  iat,
  nbf,
  exp,
  issuer = "delego-gateway",
  audience = "delego-clients",
}) {
  const payload = { userId };
  if (typeof iat === "number") payload.iat = iat;
  if (typeof nbf === "number") payload.nbf = nbf;
  if (typeof exp === "number") payload.exp = exp;
  return jwt.sign(payload, JWT_SECRET, { noTimestamp: true, issuer, audience });
}

describe("JWT clock tolerance (nbf / exp validation)", () => {
  const originalTolerance = process.env.JWT_CLOCK_TOLERANCE_SECONDS;

  before(() => {
    // Use a known tolerance window for deterministic tests.
    process.env.JWT_CLOCK_TOLERANCE_SECONDS = "5";
  });

  after(() => {
    if (originalTolerance === undefined) {
      delete process.env.JWT_CLOCK_TOLERANCE_SECONDS;
    } else {
      process.env.JWT_CLOCK_TOLERANCE_SECONDS = originalTolerance;
    }
  });

  describe("getJwtValidationConfig", () => {
    it("returns the configured tolerance from the environment", () => {
      const cfg = getJwtValidationConfig();
      assert.equal(cfg.clockToleranceSeconds, 5);
      assert.equal(typeof cfg.issuer, "string");
      assert.equal(typeof cfg.audience, "string");
    });

    it("falls back to the safe default when env var is missing", () => {
      const prev = process.env.JWT_CLOCK_TOLERANCE_SECONDS;
      delete process.env.JWT_CLOCK_TOLERANCE_SECONDS;
      try {
        const cfg = getJwtValidationConfig();
        assert.equal(cfg.clockToleranceSeconds, 5); // documented default
      } finally {
        process.env.JWT_CLOCK_TOLERANCE_SECONDS = prev;
      }
    });

    it("clamps absurdly large tolerances to the maximum (300s)", () => {
      const prev = process.env.JWT_CLOCK_TOLERANCE_SECONDS;
      process.env.JWT_CLOCK_TOLERANCE_SECONDS = "9999999";
      try {
        const cfg = getJwtValidationConfig();
        assert.equal(cfg.clockToleranceSeconds, 300);
      } finally {
        process.env.JWT_CLOCK_TOLERANCE_SECONDS = prev;
      }
    });

    it("falls back to the default when env var is not a number", () => {
      const prev = process.env.JWT_CLOCK_TOLERANCE_SECONDS;
      process.env.JWT_CLOCK_TOLERANCE_SECONDS = "not-a-number";
      try {
        const cfg = getJwtValidationConfig();
        assert.equal(cfg.clockToleranceSeconds, 5);
      } finally {
        process.env.JWT_CLOCK_TOLERANCE_SECONDS = prev;
      }
    });
  });

  describe("verifyToken — exp claim", () => {
    it("accepts a 'just-expired' token within the tolerance window", () => {
      const now = Math.floor(Date.now() / 1000);
      // Expired 2 seconds ago; tolerance is 5s -> should still verify.
      const token = signWithClaims({ iat: now - 30, exp: now - 2 });

      const decoded = verifyToken(token, {
        issuer: "delego-gateway",
        audience: "delego-clients",
        clockToleranceSeconds: 5,
      });
      assert.equal(decoded.userId, "test-user");
    });

    it("rejects a 'too-expired' token outside the tolerance window", () => {
      const now = Math.floor(Date.now() / 1000);
      // Expired 60 seconds ago; tolerance is 5s -> must reject.
      const token = signWithClaims({ iat: now - 120, exp: now - 60 });

      assert.throws(
        () =>
          verifyToken(token, {
            issuer: "delego-gateway",
            audience: "delego-clients",
            clockToleranceSeconds: 5,
          }),
        /jwt expired|TokenExpiredError/i
      );
    });
  });

  describe("verifyToken — nbf claim", () => {
    it("accepts a not-yet-valid token within the tolerance window", () => {
      const now = Math.floor(Date.now() / 1000);
      // nbf is 2s in the future; tolerance is 5s -> should verify.
      const token = signWithClaims({
        iat: now,
        nbf: now + 2,
        exp: now + 600,
      });

      const decoded = verifyToken(token, {
        issuer: "delego-gateway",
        audience: "delego-clients",
        clockToleranceSeconds: 5,
      });
      assert.equal(decoded.userId, "test-user");
    });

    it("rejects a not-yet-valid token outside the tolerance window", () => {
      const now = Math.floor(Date.now() / 1000);
      // nbf is 60s in the future; tolerance is 5s -> must reject.
      const token = signWithClaims({
        iat: now,
        nbf: now + 60,
        exp: now + 600,
      });

      assert.throws(
        () =>
          verifyToken(token, {
            issuer: "delego-gateway",
            audience: "delego-clients",
            clockToleranceSeconds: 5,
          }),
        /jwt not active|NotBeforeError/i
      );
    });
  });

  describe("verifyToken — uses env config by default", () => {
    it("honors the env-derived tolerance when no config arg is passed", () => {
      const now = Math.floor(Date.now() / 1000);
      const token = signWithClaims({ iat: now - 10, exp: now - 3 });

      // Default config from env (tolerance=5) should accept this token.
      const decoded = verifyToken(token);
      assert.equal(decoded.userId, "test-user");
    });
  });
});
