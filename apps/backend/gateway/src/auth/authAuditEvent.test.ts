import { describe, it, expect, beforeEach } from "vitest";
import {
  publishAuthAuditEvent,
  clearPublishedAuthAuditEvents,
  publishedAuthAuditEvents,
  AUTH_AUDIT_ACTIONS,
  AUTH_AUDIT_STREAM_KEY,
  type AuthAuditEvent,
} from "./authAuditEvent.js";

describe("publishAuthAuditEvent", () => {
  beforeEach(() => {
    clearPublishedAuthAuditEvents();
  });

  it("records a successful login audit payload", () => {
    publishAuthAuditEvent({
      action: AUTH_AUDIT_ACTIONS.LOGIN,
      success: true,
      requestId: "req-login-success",
      userId: "user-123",
      email: "user@example.com",
    });

    expect(publishedAuthAuditEvents).toHaveLength(1);
    expect(publishedAuthAuditEvents[0]).toEqual({
      action: "login",
      success: true,
      requestId: "req-login-success",
      userId: "user-123",
      email: "user@example.com",
      occurredAt: expect.any(String),
    } satisfies AuthAuditEvent);
  });

  it("records a failed login audit payload without userId", () => {
    publishAuthAuditEvent({
      action: AUTH_AUDIT_ACTIONS.LOGIN,
      success: false,
      requestId: "req-login-failure",
      email: "unknown@example.com",
    });

    expect(publishedAuthAuditEvents).toHaveLength(1);
    expect(publishedAuthAuditEvents[0]).toMatchObject({
      action: "login",
      success: false,
      requestId: "req-login-failure",
      email: "unknown@example.com",
    });
    expect(publishedAuthAuditEvents[0]?.userId).toBeUndefined();
  });

  it("does not include password or token fields in published events", () => {
    publishAuthAuditEvent({
      action: AUTH_AUDIT_ACTIONS.REGISTER,
      success: true,
      requestId: "req-register-success",
      userId: "user-456",
      email: "new@example.com",
    });

    const event = publishedAuthAuditEvents[0] as Record<string, unknown>;
    expect(Object.keys(event).sort()).toEqual([
      "action",
      "email",
      "occurredAt",
      "requestId",
      "success",
      "userId",
    ]);
    expect(event).not.toHaveProperty("password");
    expect(event).not.toHaveProperty("accessToken");
    expect(event).not.toHaveProperty("refreshToken");
    expect(event).not.toHaveProperty("token");
  });

  it("exports the auth audit stream key", () => {
    expect(AUTH_AUDIT_STREAM_KEY).toBe("gateway:auth:audit");
  });
});
