import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "node:events";
import type { IncomingMessage, ServerResponse } from "node:http";
import { loginHandler, registerHandler, logoutHandler } from "./auth.js";
import {
  clearPublishedAuthAuditEvents,
  publishedAuthAuditEvents,
  AUTH_AUDIT_ACTIONS,
} from "../src/auth/authAuditEvent.js";

vi.mock("../src/auth/authService.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/auth/authService.js")>();
  return {
    ...actual,
    registerUser: vi.fn(),
    loginUser: vi.fn(),
    refreshAccessToken: vi.fn(),
    logoutUser: vi.fn(),
  };
});

vi.mock("../middleware/requestId.js", () => ({
  getRequestContext: vi.fn((req: IncomingMessage) => {
    const forwarded = req.headers["x-request-id"];
    const requestId = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    return requestId ? { requestId, startedAt: Date.now() } : undefined;
  }),
}));

vi.mock("../src/request.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/request.js")>();
  return {
    ...actual,
    readJsonBody: vi.fn(),
  };
});

import { registerUser, loginUser, logoutUser } from "../src/auth/authService.js";
import { readJsonBody } from "../src/request.js";
import { generateToken } from "../src/auth/authService.js";

type MockResponse = ServerResponse & {
  statusCode: number;
  body: string;
  headersSent: boolean;
  headers: Record<string, string | string[] | number | undefined>;
};

function createMockReq(options: {
  headers?: Record<string, string>;
  cookies?: Record<string, string>;
} = {}): IncomingMessage {
  const req = new EventEmitter() as IncomingMessage;
  const cookieHeader = options.cookies
    ? Object.entries(options.cookies)
        .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
        .join("; ")
    : undefined;

  req.headers = {
    ...(options.headers ?? {}),
    ...(cookieHeader ? { cookie: cookieHeader } : {}),
  };
  return req;
}

function createMockRes(): MockResponse {
  const res = {
    statusCode: 0,
    body: "",
    headersSent: false,
    headers: {} as Record<string, string | string[] | number | undefined>,
    setHeader(name: string, value: string | number) {
      this.headers[name] = value;
    },
    writeHead(status: number, headers?: Record<string, string>) {
      this.statusCode = status;
      this.headersSent = true;
      if (headers) Object.assign(this.headers, headers);
    },
    end(body?: string) {
      if (body !== undefined) this.body = body;
    },
  };

  return res as MockResponse;
}

describe("auth route audit events", () => {
  beforeEach(() => {
    clearPublishedAuthAuditEvents();
    vi.clearAllMocks();
  });

  afterEach(() => {
    clearPublishedAuthAuditEvents();
  });

  it("publishes a successful login audit event", async () => {
    vi.mocked(readJsonBody).mockResolvedValue({
      email: "user@example.com",
      password: "secret-password",
    });
    vi.mocked(loginUser).mockResolvedValue({
      user: {
        id: "user-123",
        email: "user@example.com",
        displayName: null,
        stellarAddress: null,
      },
      accessToken: "access-token",
      refreshToken: "refresh-token",
      expiresIn: 900,
      token: "access-token",
    });

    const req = createMockReq({ headers: { "x-request-id": "req-login-1" } });
    const res = createMockRes();

    await loginHandler(req, res);

    expect(publishedAuthAuditEvents).toHaveLength(1);
    expect(publishedAuthAuditEvents[0]).toMatchObject({
      action: AUTH_AUDIT_ACTIONS.LOGIN,
      success: true,
      requestId: "req-login-1",
      userId: "user-123",
      email: "user@example.com",
    });
    expect(JSON.stringify(publishedAuthAuditEvents[0])).not.toContain("secret-password");
    expect(JSON.stringify(publishedAuthAuditEvents[0])).not.toContain("access-token");
  });

  it("publishes a failed login audit event", async () => {
    vi.mocked(readJsonBody).mockResolvedValue({
      email: "user@example.com",
      password: "wrong-password",
    });
    vi.mocked(loginUser).mockRejectedValue(new Error("Invalid email or password"));

    const req = createMockReq({ headers: { "x-request-id": "req-login-2" } });
    const res = createMockRes();

    await loginHandler(req, res);

    expect(res.statusCode).toBe(401);
    expect(publishedAuthAuditEvents).toHaveLength(1);
    expect(publishedAuthAuditEvents[0]).toMatchObject({
      action: AUTH_AUDIT_ACTIONS.LOGIN,
      success: false,
      requestId: "req-login-2",
      email: "user@example.com",
    });
    expect(publishedAuthAuditEvents[0]?.userId).toBeUndefined();
  });

  it("publishes a successful registration audit event", async () => {
    vi.mocked(readJsonBody).mockResolvedValue({
      email: "new@example.com",
      password: "secret-password",
      displayName: "New User",
    });
    vi.mocked(registerUser).mockResolvedValue({
      user: {
        id: "user-456",
        email: "new@example.com",
        displayName: "New User",
      },
      accessToken: "access-token",
      refreshToken: "refresh-token",
      expiresIn: 900,
      token: "access-token",
    });

    const req = createMockReq({ headers: { "x-request-id": "req-register-1" } });
    const res = createMockRes();

    await registerHandler(req, res);

    expect(publishedAuthAuditEvents).toHaveLength(1);
    expect(publishedAuthAuditEvents[0]).toMatchObject({
      action: AUTH_AUDIT_ACTIONS.REGISTER,
      success: true,
      requestId: "req-register-1",
      userId: "user-456",
      email: "new@example.com",
    });
  });

  it("publishes a successful logout audit event", async () => {
    const accessToken = generateToken("user-789", "logout@example.com");
    vi.mocked(logoutUser).mockResolvedValue(undefined);

    const req = createMockReq({
      headers: {
        authorization: `Bearer ${accessToken}`,
        "x-request-id": "req-logout-1",
      },
      cookies: { refresh_token: "refresh-token-value" },
    });
    const res = createMockRes();

    await logoutHandler(req, res);

    expect(logoutUser).toHaveBeenCalledWith("refresh-token-value");
    expect(publishedAuthAuditEvents).toHaveLength(1);
    expect(publishedAuthAuditEvents[0]).toMatchObject({
      action: AUTH_AUDIT_ACTIONS.LOGOUT,
      success: true,
      requestId: "req-logout-1",
      userId: "user-789",
      email: "logout@example.com",
    });
    expect(JSON.stringify(publishedAuthAuditEvents[0])).not.toContain("refresh-token-value");
  });

  it("publishes a failed logout audit event when unauthenticated", async () => {
    const req = createMockReq({ headers: { "x-request-id": "req-logout-2" } });
    const res = createMockRes();

    await logoutHandler(req, res);

    expect(res.statusCode).toBe(401);
    expect(publishedAuthAuditEvents).toHaveLength(1);
    expect(publishedAuthAuditEvents[0]).toMatchObject({
      action: AUTH_AUDIT_ACTIONS.LOGOUT,
      success: false,
      requestId: "req-logout-2",
    });
  });
});
