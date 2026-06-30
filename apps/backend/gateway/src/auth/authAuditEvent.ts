import { createLogger } from "@delego/utils";

const log = createLogger("gateway:auth:audit", process.env.LOG_LEVEL ?? "info");

/**
 * Internal audit event emitted by gateway auth routes.
 * Must never include passwords, refresh tokens, or access tokens.
 */
export interface AuthAuditEvent {
  userId?: string;
  email?: string;
  action: string;
  success: boolean;
  requestId: string;
  occurredAt: string;
}

/** Redis stream key for auth audit events (`gateway:auth:audit`). */
export const AUTH_AUDIT_STREAM_KEY = "gateway:auth:audit";

export const AUTH_AUDIT_ACTIONS = {
  LOGIN: "login",
  REGISTER: "register",
  LOGOUT: "logout",
} as const;

/** In-memory sink for auth audit events — swap for Redis publish in production. */
export const publishedAuthAuditEvents: AuthAuditEvent[] = [];

export function clearPublishedAuthAuditEvents(): void {
  publishedAuthAuditEvents.length = 0;
}

/**
 * Publish an auth audit event. Failures are logged and never re-thrown so
 * audit plumbing cannot block authentication responses.
 */
export function publishAuthAuditEvent(
  event: Omit<AuthAuditEvent, "occurredAt"> & { occurredAt?: string }
): void {
  const fullEvent: AuthAuditEvent = {
    ...event,
    occurredAt: event.occurredAt ?? new Date().toISOString(),
  };

  try {
    publishedAuthAuditEvents.push(fullEvent);
    log.info("Auth audit event published", {
      streamKey: AUTH_AUDIT_STREAM_KEY,
      action: fullEvent.action,
      success: fullEvent.success,
      requestId: fullEvent.requestId,
      ...(fullEvent.userId ? { userId: fullEvent.userId } : {}),
    });
  } catch (err) {
    log.error("Failed to publish auth audit event", {
      action: fullEvent.action,
      requestId: fullEvent.requestId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
