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

/**
 * Raw environment values for one read of `env`.
 *
 * Every key the schema validates is read as a **static** `process.env.NEXT_PUBLIC_*`
 * member access, never as `process.env[key]`. Next.js replaces static member
 * accesses with build-time literals when it bundles for the browser; a computed
 * lookup is left alone and resolves against the browser's `process` shim, which
 * carries no values. Validating through a computed lookup therefore threw
 * `NEXT_PUBLIC_API_URL Required` during hydration, `global-error` replaced the
 * whole document, and every route lost its `<title>`.
 *
 * This is also why the keys are spelled out here instead of derived from
 * `envSchema.shape`: the bundler can only inline literals it can see.
 * `lib/env.static-reads.test.ts` fails if the two ever drift.
 */
function readRawEnv(): Record<string, unknown> {
  return {
    ...process.env,
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
    NEXT_PUBLIC_FEATURE_CLIENT_SIDE_SIGNING:
      process.env.NEXT_PUBLIC_FEATURE_CLIENT_SIDE_SIGNING,
    NEXT_PUBLIC_FEATURE_DUAL_CONTROL_APPROVALS:
      process.env.NEXT_PUBLIC_FEATURE_DUAL_CONTROL_APPROVALS,
    NEXT_PUBLIC_IDLE_SESSION_ENABLED: process.env.NEXT_PUBLIC_IDLE_SESSION_ENABLED,
    NEXT_PUBLIC_IDLE_TIMEOUT_MINUTES: process.env.NEXT_PUBLIC_IDLE_TIMEOUT_MINUTES,
    NEXT_PUBLIC_IDLE_WARNING_SECONDS:
      process.env.NEXT_PUBLIC_IDLE_WARNING_SECONDS,
    NEXT_PUBLIC_CANONICAL_HOSTS: process.env.NEXT_PUBLIC_CANONICAL_HOSTS,
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
  };
}

// Validate eagerly so a missing or malformed NEXT_PUBLIC_API_URL fails the
// moment the app boots, not at some later property read.
envSchema.parse(readRawEnv());

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
    return envSchema.parse(readRawEnv())[property];
  },
  has(_target, property) {
    return typeof property === "string" && property in envSchema.parse(readRawEnv());
  },
  ownKeys() {
    return Reflect.ownKeys(envSchema.parse(readRawEnv()));
  },
  getOwnPropertyDescriptor(_target, property) {
    if (typeof property !== "string") return undefined;
    const parsed = envSchema.parse(readRawEnv()) as Record<string, unknown>;
    if (!(property in parsed)) return undefined;
    return { configurable: true, enumerable: true, value: parsed[property] };
  },
});