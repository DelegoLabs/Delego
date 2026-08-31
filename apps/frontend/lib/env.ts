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
  })
  .passthrough();

export const env = envSchema.parse(process.env);
