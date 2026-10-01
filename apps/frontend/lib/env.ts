import { z } from "zod";

const envSchema = z
  .object({
    NEXT_PUBLIC_API_URL: z
      .string()
      .url("NEXT_PUBLIC_API_URL must be a valid URL"),
    NEXT_PUBLIC_FEATURE_CLIENT_SIDE_SIGNING: z.string().optional(),
    NEXT_PUBLIC_FEATURE_DUAL_CONTROL_APPROVALS: z.string().optional(),
    // Idle-session keep-alive (#514). All optional — see lib/idleSession.ts
    // for how these resolve (disabled in dev unless explicitly opted in).
    NEXT_PUBLIC_IDLE_SESSION_ENABLED: z.string().optional(),
    NEXT_PUBLIC_IDLE_TIMEOUT_MINUTES: z.string().optional(),
    NEXT_PUBLIC_IDLE_WARNING_SECONDS: z.string().optional(),
    NEXT_PUBLIC_CANONICAL_HOSTS: z.string().optional(),
    // Web Push VAPID public key (#web-push). Required to subscribe to push
    // notifications — leave unset to disable the feature entirely.
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: z.string().optional(),
  })
  .passthrough();

export type Env = z.infer<typeof envSchema>;

// Validate eagerly so a missing or malformed NEXT_PUBLIC_API_URL fails the
// moment the app boots, not at some later property read.
envSchema.parse(process.env);

/**
 * Validated environment, resolved on each property read rather than
 * snapshotted at import time.
 *
 * Capturing the parsed object once meant a module that imported `env` before
 * a test set a variable could never see it — `process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY`
 * assigned in a `beforeEach` had no effect on the already-validated value, so
 * the Web Push suites failed against a key that was in fact present. Reading
 * through keeps the eager validation above while letting optional settings
 * (feature flags, VAPID key, canonical hosts) vary per test.
 */
export const env: Env = new Proxy({} as Env, {
  get(_target, property) {
    if (typeof property !== "string") {
      return undefined;
    }
    return envSchema.parse(process.env)[property];
  },
  has(_target, property) {
    return typeof property === "string" && property in envSchema.parse(process.env);
  },
  ownKeys() {
    return Reflect.ownKeys(envSchema.parse(process.env));
  },
  getOwnPropertyDescriptor(_target, property) {
    if (typeof property !== "string") return undefined;
    const parsed = envSchema.parse(process.env) as Record<string, unknown>;
    if (!(property in parsed)) return undefined;
    return { configurable: true, enumerable: true, value: parsed[property] };
  },
});
