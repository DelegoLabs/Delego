// @vitest-environment jsdom

import React from "react";
import { render, screen, cleanup } from "@testing-library/react";
import { renderHook } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  parseFeatureFlagValue,
  getStaticEnvFlag,
  isFeatureEnabled,
  FeatureFlagProvider,
  useFeatureFlag,
  IfFeature,
} from "./featureFlags";

describe("featureFlags", () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.NEXT_PUBLIC_FEATURE_CLIENT_SIDE_SIGNING;
    delete process.env.NEXT_PUBLIC_FEATURE_DUAL_CONTROL_APPROVALS;
    delete process.env.NEXT_PUBLIC_FEATURE_NONEXISTENT;
    delete process.env.UNKNOWN_RANDOM_FLAG;
    delete process.env.UNKNOWN_FEATURE_FLAG;
    delete process.env.UNKNOWN_FLAG;
  });

  afterEach(() => {
    cleanup();
    delete process.env.NEXT_PUBLIC_FEATURE_CLIENT_SIDE_SIGNING;
    delete process.env.NEXT_PUBLIC_FEATURE_DUAL_CONTROL_APPROVALS;
    delete process.env.NEXT_PUBLIC_FEATURE_NONEXISTENT;
    delete process.env.UNKNOWN_RANDOM_FLAG;
    delete process.env.UNKNOWN_FEATURE_FLAG;
    delete process.env.UNKNOWN_FLAG;
  });

  describe("parseFeatureFlagValue", () => {
    it("parses booleans correctly", () => {
      expect(parseFeatureFlagValue(true)).toBe(true);
      expect(parseFeatureFlagValue(false)).toBe(false);
    });

    it("parses truthy string values correctly", () => {
      expect(parseFeatureFlagValue("true")).toBe(true);
      expect(parseFeatureFlagValue("TRUE")).toBe(true);
      expect(parseFeatureFlagValue(" 1 ")).toBe(true);
      expect(parseFeatureFlagValue("yes")).toBe(true);
      expect(parseFeatureFlagValue("on")).toBe(true);
    });

    it("returns false for falsy or invalid values (default-deny)", () => {
      expect(parseFeatureFlagValue("false")).toBe(false);
      expect(parseFeatureFlagValue("0")).toBe(false);
      expect(parseFeatureFlagValue("off")).toBe(false);
      expect(parseFeatureFlagValue("")).toBe(false);
      expect(parseFeatureFlagValue(undefined)).toBe(false);
      expect(parseFeatureFlagValue(null)).toBe(false);
      expect(parseFeatureFlagValue(123)).toBe(false);
      expect(parseFeatureFlagValue({})).toBe(false);
    });
  });

  describe("getStaticEnvFlag and isFeatureEnabled", () => {
    it("reads enabled status for known flag via short name", () => {
      process.env.NEXT_PUBLIC_FEATURE_CLIENT_SIDE_SIGNING = "true";
      expect(getStaticEnvFlag("CLIENT_SIDE_SIGNING")).toBe("true");
      expect(isFeatureEnabled("CLIENT_SIDE_SIGNING")).toBe(true);
    });

    it("reads enabled status for known flag via full env name", () => {
      process.env.NEXT_PUBLIC_FEATURE_CLIENT_SIDE_SIGNING = "1";
      expect(getStaticEnvFlag("NEXT_PUBLIC_FEATURE_CLIENT_SIDE_SIGNING")).toBe(
        "1"
      );
      expect(isFeatureEnabled("NEXT_PUBLIC_FEATURE_CLIENT_SIDE_SIGNING")).toBe(
        true
      );
    });

    it("returns false when known flag is set to false or omitted (disabled path)", () => {
      process.env.NEXT_PUBLIC_FEATURE_CLIENT_SIDE_SIGNING = "false";
      expect(isFeatureEnabled("CLIENT_SIDE_SIGNING")).toBe(false);

      delete process.env.NEXT_PUBLIC_FEATURE_CLIENT_SIDE_SIGNING;
      expect(isFeatureEnabled("CLIENT_SIDE_SIGNING")).toBe(false);
    });

    it("returns false for unknown flag names (default-deny path)", () => {
      expect(isFeatureEnabled("UNKNOWN_RANDOM_FLAG")).toBe(false);
      expect(isFeatureEnabled("NEXT_PUBLIC_FEATURE_NONEXISTENT")).toBe(false);
    });

    it("reads the dual-control approvals flag (#574)", () => {
      process.env.NEXT_PUBLIC_FEATURE_DUAL_CONTROL_APPROVALS = "true";
      expect(isFeatureEnabled("DUAL_CONTROL_APPROVALS")).toBe(true);
      delete process.env.NEXT_PUBLIC_FEATURE_DUAL_CONTROL_APPROVALS;
      expect(isFeatureEnabled("DUAL_CONTROL_APPROVALS")).toBe(false);
    });

    it("respects initialFlags overrides when provided", () => {
      process.env.NEXT_PUBLIC_FEATURE_CLIENT_SIDE_SIGNING = "false";
      expect(
        isFeatureEnabled("CLIENT_SIDE_SIGNING", { CLIENT_SIDE_SIGNING: true })
      ).toBe(true);
      expect(
        isFeatureEnabled("CLIENT_SIDE_SIGNING", { CLIENT_SIDE_SIGNING: false })
      ).toBe(false);
    });
  });

  describe("useFeatureFlag hook", () => {
    it("works outside FeatureFlagProvider defaulting to static lookup", () => {
      process.env.NEXT_PUBLIC_FEATURE_CLIENT_SIDE_SIGNING = "true";
      const { result } = renderHook(() =>
        useFeatureFlag("CLIENT_SIDE_SIGNING")
      );
      expect(result.current).toBe(true);
    });

    it("reads overrides inside FeatureFlagProvider context", () => {
      process.env.NEXT_PUBLIC_FEATURE_CLIENT_SIDE_SIGNING = "false";

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <FeatureFlagProvider initialFlags={{ CLIENT_SIDE_SIGNING: true }}>
          {children}
        </FeatureFlagProvider>
      );

      const { result } = renderHook(
        () => useFeatureFlag("CLIENT_SIDE_SIGNING"),
        { wrapper }
      );
      expect(result.current).toBe(true);
    });

    it("returns false for unknown flags inside FeatureFlagProvider context", () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <FeatureFlagProvider>{children}</FeatureFlagProvider>
      );

      const { result } = renderHook(() => useFeatureFlag("UNKNOWN_FLAG"), {
        wrapper,
      });
      expect(result.current).toBe(false);
    });
  });

  describe("<IfFeature /> component", () => {
    it("renders children when feature is enabled", () => {
      process.env.NEXT_PUBLIC_FEATURE_CLIENT_SIDE_SIGNING = "true";

      render(
        <IfFeature
          name="CLIENT_SIDE_SIGNING"
          fallback={<div>Disabled Content</div>}
        >
          <div>Enabled Content</div>
        </IfFeature>
      );

      expect(screen.getByText("Enabled Content")).toBeDefined();
      expect(screen.queryByText("Disabled Content")).toBeNull();
    });

    it("renders fallback when feature is disabled", () => {
      process.env.NEXT_PUBLIC_FEATURE_CLIENT_SIDE_SIGNING = "false";

      render(
        <IfFeature
          name="CLIENT_SIDE_SIGNING"
          fallback={<div>Disabled Content</div>}
        >
          <div>Enabled Content</div>
        </IfFeature>
      );

      expect(screen.queryByText("Enabled Content")).toBeNull();
      expect(screen.getByText("Disabled Content")).toBeDefined();
    });

    it("renders null by default when feature is disabled and no fallback provided", () => {
      process.env.NEXT_PUBLIC_FEATURE_CLIENT_SIDE_SIGNING = "false";

      const { container } = render(
        <IfFeature name="CLIENT_SIDE_SIGNING">
          <div>Enabled Content</div>
        </IfFeature>
      );

      expect(container.textContent).toBe("");
    });

    it("default-denies unknown flag names rendering fallback or null", () => {
      render(
        <IfFeature
          name="UNKNOWN_FEATURE_FLAG"
          fallback={<div>Unknown Fallback</div>}
        >
          <div>Feature Content</div>
        </IfFeature>
      );

      expect(screen.queryByText("Feature Content")).toBeNull();
      expect(screen.getByText("Unknown Fallback")).toBeDefined();
    });
  });
});
