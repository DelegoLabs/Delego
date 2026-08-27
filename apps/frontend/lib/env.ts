import { z } from "zod";

const envSchema = z
  .object({
    NEXT_PUBLIC_API_URL: z
      .string()
      .url("NEXT_PUBLIC_API_URL must be a valid URL"),
    NEXT_PUBLIC_FEATURE_CLIENT_SIDE_SIGNING: z.string().optional(),
    NEXT_PUBLIC_FEATURE_DUAL_CONTROL_APPROVALS: z.string().optional(),
  })
  .passthrough();

export const env = envSchema.parse(process.env);
