import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  hashPassword,
  comparePassword,
  generateToken,
  verifyToken,
  registerUser,
  loginUser,
} from "../../../apps/backend/gateway/dist/src/auth/authService.js";
import { extractAuth } from "../../../apps/backend/gateway/dist/middleware/auth.js";
import { User } from "../../../apps/backend/gateway/dist/src/models/User.js";
import { RefreshToken } from "../../../apps/backend/gateway/dist/src/models/RefreshToken.js";

describe("Gateway Authentication System", () => {
  describe("Password Hashing (bcrypt)", () => {
    it("should securely hash a password and verify it", async () => {
      const password = "mySuperSecretPassword123";
      const hash = await hashPassword(password);

      assert.ok(hash);
      assert.notEqual(hash, password);
      assert.ok(hash.startsWith("$2")); // bcrypt prefix

      const isMatch = await comparePassword(password, hash);
      assert.equal(isMatch, true);

      const isNotMatch = await comparePassword("wrongPassword", hash);
      assert.equal(isNotMatch, false);
    });
  });

  describe("JWT Token Issuance & Verification", () => {
    it("should generate a JWT token and verify/decode the userId", () => {
      const userId = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
      const token = generateToken(userId);

      assert.ok(token);
      assert.equal(typeof token, "string");

      const decoded = verifyToken(token);
      assert.equal(decoded.userId, userId);
    });

    it("should throw an error for an invalid/tampered token", () => {
      assert.throws(() => {
        verifyToken("invalid.token.signature");
      });
    });
  });

  describe("Authentication Middleware (extractAuth)", () => {
    it("should return nulls if no Authorization header is present", () => {
      const mockReq = { headers: {} };
      const auth = extractAuth(mockReq);

      assert.equal(auth.userId, null);
      assert.equal(auth.token, null);
    });

    it("should return nulls if Authorization header does not use Bearer scheme", () => {
      const mockReq = { headers: { authorization: "Basic dXNlcjpwYXNz" } };
      const auth = extractAuth(mockReq);

      assert.equal(auth.userId, null);
      assert.equal(auth.token, null);
    });

    it("should return nulls if JWT is invalid", () => {
      const mockReq = { headers: { authorization: "Bearer invalidjwt" } };
      const auth = extractAuth(mockReq);

      assert.equal(auth.userId, null);
      assert.equal(auth.token, null);
    });

    it("should return userId and token if JWT is valid", () => {
      const userId = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
      const token = generateToken(userId);
      const mockReq = { headers: { authorization: `Bearer ${token}` } };
      const auth = extractAuth(mockReq);

      assert.equal(auth.userId, userId);
      assert.equal(auth.token, token);
    });
  });

  describe("Auth Service (register & login flow stubs)", () => {
    const originalFindOne = User.findOne;
    const originalCreate = User.create;
    const originalRefreshTokenCreate = RefreshToken.create;
    const originalRefreshTokenFindAll = RefreshToken.findAll;

    it("should register a user successfully if they do not exist", async () => {
      // Mock db methods
      User.findOne = async () => null; // user not found
      User.create = async (data) => ({
        id: "mocked-user-id",
        email: data.email,
        displayName: data.displayName || null,
        stellarAddress: null,
      });
      RefreshToken.create = async () => ({});

      const result = await registerUser("test@delego.dev", "password123", "Test User");

      assert.equal(result.user.id, "mocked-user-id");
      assert.equal(result.user.email, "test@delego.dev");
      assert.ok(result.token);
      assert.ok(result.accessToken);
      assert.ok(result.refreshToken);
      assert.equal(result.token, result.accessToken);

      const decoded = verifyToken(result.token);
      assert.equal(decoded.userId, "mocked-user-id");
    });

    it("should throw if registering an already existing email", async () => {
      User.findOne = async () => ({ id: "existing-id" });
      RefreshToken.create = async () => ({});

      await assert.rejects(
        registerUser("test@delego.dev", "password123"),
        /User with this email already exists/
      );
    });

    it("should login a user successfully with valid credentials", async () => {
      const mockPasswordHash = await hashPassword("password123");
      User.findOne = async () => ({
        id: "mocked-user-id",
        email: "test@delego.dev",
        passwordHash: mockPasswordHash,
        displayName: "Test User",
        stellarAddress: null,
      });
      RefreshToken.create = async () => ({});

      const result = await loginUser("test@delego.dev", "password123");

      assert.equal(result.user.id, "mocked-user-id");
      assert.equal(result.user.email, "test@delego.dev");
      assert.ok(result.token);
      assert.ok(result.accessToken);
      assert.ok(result.refreshToken);
      assert.equal(result.token, result.accessToken);
    });

    it("should throw if logging in with invalid password", async () => {
      const mockPasswordHash = await hashPassword("password123");
      User.findOne = async () => ({
        id: "mocked-user-id",
        email: "test@delego.dev",
        passwordHash: mockPasswordHash,
      });
      RefreshToken.create = async () => ({});

      await assert.rejects(
        loginUser("test@delego.dev", "wrong-password"),
        /Invalid email or password/
      );
    });

    // Cleanup stubs
    User.findOne = originalFindOne;
    User.create = originalCreate;
    RefreshToken.create = originalRefreshTokenCreate;
    RefreshToken.findAll = originalRefreshTokenFindAll;
  });
});
