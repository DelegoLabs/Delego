"use client";

import React, {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from "react";

/**
 * Registry of known feature flags in the application.
 * Map short flag names to their corresponding NEXT_PUBLIC_FEATURE_* env variable names.
 */
export const KNOWN_FEATURE_FLAGS = {
  CLIENT_SIDE_SIGNING: "NEXT_PUBLIC_FEATURE_CLIENT_SIDE_SIGNING",
  /** Dual-control approvals above a configurable per-order threshold (#574). */
  DUAL_CONTROL_APPROVALS: "NEXT_PUBLIC_FEATURE_DUAL_CONTROL_APPROVALS",
} as const;

export type KnownFeatureFlag = keyof typeof KNOWN_FEATURE_FLAGS;
export type FeatureFlagName = KnownFeatureFlag | (string & {});

/**
 * Utility to parse string / boolean values into a boolean flag.
 * Default-deny for undefined, null, or non-truthy values.
 */
export function parseFeatureFlagValue(value: unknown): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return (
      normalized === "true" ||
      normalized === "1" ||
      normalized === "yes" ||
      normalized === "on"
    );
  }
  return false;
}

/**
 * Access static environment variables explicitly to enable static analysis
 * and tree-shaking by build tools (Next.js / Webpack / Turbopack).
 */
export function getStaticEnvFlag(name: string): string | undefined {
  switch (name) {
    case "CLIENT_SIDE_SIGNING":
    case "NEXT_PUBLIC_FEATURE_CLIENT_SIDE_SIGNING":
      return process.env.NEXT_PUBLIC_FEATURE_CLIENT_SIDE_SIGNING;
    case "DUAL_CONTROL_APPROVALS":
    case "NEXT_PUBLIC_FEATURE_DUAL_CONTROL_APPROVALS":
      return process.env.NEXT_PUBLIC_FEATURE_DUAL_CONTROL_APPROVALS;
    default:
      // Fallback dynamic lookup for unknown or runtime env keys
      if (typeof process !== "undefined" && process.env) {
        return (
          process.env[name] ??
          (name.startsWith("NEXT_PUBLIC_FEATURE_")
            ? process.env[name]
            : process.env[`NEXT_PUBLIC_FEATURE_${name}`])
        );
      }
      return undefined;
  }
}

/**
 * Check if a feature flag is enabled statically.
 * Unknown names or unconfigured flags default to false (default-deny).
 */
export function isFeatureEnabled(
  name: FeatureFlagName,
  overrides?: Record<string, boolean>
): boolean {
  if (overrides && name in overrides) {
    return Boolean(overrides[name]);
  }

  // Check static environment variable access
  const envVal = getStaticEnvFlag(name);
  return parseFeatureFlagValue(envVal);
}

export interface FeatureFlagContextType {
  flags: Record<string, boolean>;
  isEnabled: (name: FeatureFlagName) => boolean;
}

export const FeatureFlagContext = createContext<FeatureFlagContextType | null>(
  null
);

export interface FeatureFlagProviderProps {
  children: ReactNode;
  initialFlags?: Record<string, boolean>;
}

/**
 * React Context Provider for Feature Flags.
 * Allows nested tree override or custom flags for testing and client runtime.
 */
export function FeatureFlagProvider({
  children,
  initialFlags = {},
}: FeatureFlagProviderProps) {
  const isEnabled = useMemo(() => {
    return (name: FeatureFlagName) => isFeatureEnabled(name, initialFlags);
  }, [initialFlags]);

  const value = useMemo(
    () => ({
      flags: initialFlags,
      isEnabled,
    }),
    [initialFlags, isEnabled]
  );

  return (
    <FeatureFlagContext.Provider value={value}>
      {children}
    </FeatureFlagContext.Provider>
  );
}

/**
 * Hook to consume feature flag status within React components.
 * Falls back to static environment variable lookup if used outside FeatureFlagProvider.
 */
export function useFeatureFlag(name: FeatureFlagName): boolean {
  const context = useContext(FeatureFlagContext);
  if (!context) {
    return isFeatureEnabled(name);
  }
  return context.isEnabled(name);
}

export interface IfFeatureProps {
  name: FeatureFlagName;
  children: ReactNode;
  fallback?: ReactNode;
}

/**
 * Conditional wrapper component that renders children when the feature flag is enabled,
 * or fallback (or null) when disabled / unknown.
 */
export function IfFeature({ name, children, fallback = null }: IfFeatureProps) {
  const enabled = useFeatureFlag(name);
  return enabled ? <>{children}</> : <>{fallback}</>;
}
