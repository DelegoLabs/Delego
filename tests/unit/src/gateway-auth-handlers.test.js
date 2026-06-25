import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import {
  registerHandler,
  loginHandler,
  refreshHandler,
  logoutHandler,
  authDependencies,
} from "../../../apps/backend/gateway/routes/auth.ts";

function createJsonRequest(body, headers = {}) {
  const req = new Readable({
    read() {
      this.push(Buffer.from(JSON.stringify(body)));
      this.push(null);
    },
  });
  req.headers = { "content-type": "application/json", ...headers };
  req.method = "POST";
  return req;
}

function createRequest(body = null, headers = {}) {
  const req = new Readable({
    read() {
      if (body !== null) {
        this.push(Buffer.from(body));
      }
      this.push(null);
    },
  });
  req.headers = headers;
  req.method = "POST";
  return req;
}

function createResponse() {
  let body = "";
  return {
    statusCode: 0,
    headers: {},
    body: null,
    writeHead(status, headers) {
      this.statusCode = status;
      this.headers = { ...this.headers, ...headers };
    },
    setHeader(name, value) {
      this.headers[name] = value;
    },
    end(data) {
      if (data) body += data;
      this.body = body;
    },
  };
}

describe("Gateway Auth Handlers", () => {
  const originalDependencies = { ...authDependencies };

  afterEach(() => {
    Object.assign(authDependencies, originalDependencies);
  });

  describe("registerHandler", () => {
    it("should successfully register a new user and set refresh token cookie", async () => {
      authDependencies.registerUser = async () => ({
        user: {
          id: "user_123",
          email: "user@example.com",
          displayName: "John Doe",
        },
        accessToken: "access-token",
        refreshToken: "refresh-token",
        expiresIn: 900,
      });

      const req = createJsonRequest({
        email: "user@example.com",
        password: "securePassword123",
        displayName: "John Doe",
      });
      const res = createResponse();

      await registerHandler(req, res);

      assert.equal(res.statusCode, 201);
      const responseBody = JSON.parse(res.body);
      assert.equal(responseBody.data.user.email, "user@example.com");
      assert.equal(responseBody.data.accessToken, "access-token");
      assert.equal(responseBody.error, null);
      assert.ok(
        res.headers["Set-Cookie"].includes("refresh_token=refresh-token"),
      );
    });

    it("should return 400 VALIDATION_ERROR for invalid email format", async () => {
      const req = createJsonRequest({
        email: "not-an-email",
        password: "securePassword123",
      });
      const res = createResponse();

      await registerHandler(req, res);

      assert.equal(res.statusCode, 400);
      const responseBody = JSON.parse(res.body);
      assert.equal(responseBody.error.code, "VALIDATION_ERROR");
      assert.ok(Array.isArray(responseBody.error.details));
    });
  });

  describe("loginHandler", () => {
    it("should return 401 UNAUTHORIZED for invalid credentials", async () => {
      authDependencies.loginUser = async () => {
        throw new Error("Invalid email or password");
      };

      const req = createJsonRequest({
        email: "user@example.com",
        password: "wrongPassword",
      });
      const res = createResponse();

      await loginHandler(req, res);

      assert.equal(res.statusCode, 401);
      const responseBody = JSON.parse(res.body);
      assert.equal(responseBody.error.code, "UNAUTHORIZED");
    });

    it("should return 400 VALIDATION_ERROR for invalid email format", async () => {
      const req = createJsonRequest({
        email: "invalid-email",
        password: "securePassword123",
      });
      const res = createResponse();

      await loginHandler(req, res);

      assert.equal(res.statusCode, 400);
      const responseBody = JSON.parse(res.body);
      assert.equal(responseBody.error.code, "VALIDATION_ERROR");
    });
  });

  describe("refreshHandler", () => {
    it("should return 401 UNAUTHORIZED if refresh token cookie is missing", async () => {
      const req = createRequest(null, { cookie: "" });
      const res = createResponse();

      await refreshHandler(req, res);

      assert.equal(res.statusCode, 401);
      const responseBody = JSON.parse(res.body);
      assert.equal(responseBody.error.code, "UNAUTHORIZED");
      assert.equal(responseBody.error.message, "Refresh token missing");
    });

    it("should successfully refresh access token with valid refresh token", async () => {
      authDependencies.refreshAccessToken = async () => ({
        accessToken: "new-access-token",
        refreshToken: "new-refresh-token",
        expiresIn: 900,
      });

      const req = createRequest(null, { cookie: "refresh_token=valid-token" });
      const res = createResponse();

      await refreshHandler(req, res);

      assert.equal(res.statusCode, 200);
      const responseBody = JSON.parse(res.body);
      assert.equal(responseBody.data.accessToken, "new-access-token");
      assert.ok(
        res.headers["Set-Cookie"].includes("refresh_token=new-refresh-token"),
      );
    });
  });

  describe("logoutHandler", () => {
    it("should reject empty Bearer credentials", async () => {
      const req = createRequest(null, { authorization: "Bearer " });
      const res = createResponse();

      await logoutHandler(req, res);

      assert.equal(res.statusCode, 401);
      const responseBody = JSON.parse(res.body);
      assert.equal(responseBody.error.code, "UNAUTHORIZED");
    });

    it("should successfully logout user with valid Authorization header", async () => {
      const req = createRequest(null, { authorization: "Bearer valid-token" });
      const res = createResponse();

      await logoutHandler(req, res);

      assert.equal(res.statusCode, 200);
      const responseBody = JSON.parse(res.body);
      assert.equal(responseBody.data.success, true);
      assert.equal(responseBody.error, null);
      assert.ok(res.headers["Set-Cookie"].includes("Max-Age=0"));
    });
  });
});
