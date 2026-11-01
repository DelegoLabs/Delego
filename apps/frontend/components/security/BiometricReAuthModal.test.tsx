import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  BiometricReAuthModal,
  hasElevatedPrivilege,
  grantElevatedPrivilege,
  revokeElevatedPrivilege,
  ELEVATED_PRIVILEGE_KEY,
} from "./BiometricReAuthModal";

describe("BiometricReAuthModal (Issue #1025)", () => {
  const defaultProps = {
    actionDescription: "reveal recovery phrase",
    onSuccess: vi.fn(),
    onCancel: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
  });

  afterEach(() => {
    revokeElevatedPrivilege();
  });

  it("renders modal with security verification title and action description", () => {
    render(<BiometricReAuthModal {...defaultProps} />);

    expect(
      screen.getByRole("heading", { name: "Security Verification Required" })
    ).toBeInTheDocument();
    expect(
      screen.getByText(/reveal recovery phrase/i)
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Verify Biometric Passkey" })
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("immediately calls onSuccess if session already has active elevated privilege", () => {
    grantElevatedPrivilege(60000);
    expect(hasElevatedPrivilege()).toBe(true);

    const onSuccess = vi.fn();
    render(<BiometricReAuthModal {...defaultProps} onSuccess={onSuccess} />);

    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it("calls onCancel when Cancel button is clicked", () => {
    const onCancel = vi.fn();
    render(<BiometricReAuthModal {...defaultProps} onCancel={onCancel} />);

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("calls onCancel when Escape key is pressed", () => {
    const onCancel = vi.fn();
    render(<BiometricReAuthModal {...defaultProps} onCancel={onCancel} />);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("triggers navigator.credentials.get with userVerification: 'required' and elevates session on success", async () => {
    const mockCredentialsGet = vi.fn().mockResolvedValue({ id: "credential_123" });
    Object.defineProperty(window.navigator, "credentials", {
      value: { get: mockCredentialsGet },
      configurable: true,
      writable: true,
    });

    const onSuccess = vi.fn();
    render(<BiometricReAuthModal {...defaultProps} onSuccess={onSuccess} />);

    fireEvent.click(screen.getByRole("button", { name: "Verify Biometric Passkey" }));

    await waitFor(() => {
      expect(mockCredentialsGet).toHaveBeenCalledTimes(1);
    });

    const getCallArg = mockCredentialsGet.mock.calls[0][0];
    expect(getCallArg.publicKey.userVerification).toBe("required");

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledTimes(1);
      expect(hasElevatedPrivilege()).toBe(true);
    });
  });

  it("displays error message and prevents unauthorized changes if biometric authentication fails", async () => {
    const mockCredentialsGet = vi
      .fn()
      .mockRejectedValue(new Error("Biometric sensor not recognized"));
    Object.defineProperty(window.navigator, "credentials", {
      value: { get: mockCredentialsGet },
      configurable: true,
      writable: true,
    });

    const onSuccess = vi.fn();
    render(<BiometricReAuthModal {...defaultProps} onSuccess={onSuccess} />);

    fireEvent.click(screen.getByRole("button", { name: "Verify Biometric Passkey" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
      expect(screen.getByText("Biometric sensor not recognized")).toBeInTheDocument();
    });

    expect(onSuccess).not.toHaveBeenCalled();
    expect(hasElevatedPrivilege()).toBe(false);
  });
});
