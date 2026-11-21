import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BiometricReAuthModal,
  clearElevatedSession,
  DEFAULT_ELEVATION_DURATION_MS,
  ELEVATED_SESSION_STORAGE_KEY,
  isSessionElevated,
  setElevatedSession,
} from "./BiometricReAuthModal";

describe("Session Elevation Helpers", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    window.sessionStorage.clear();
  });

  it("reports session as not elevated when storage is empty", () => {
    expect(isSessionElevated()).toBe(false);
  });

  it("elevates session for the default duration and validates expiry", () => {
    const now = 1_700_000_000_000;
    vi.spyOn(Date, "now").mockReturnValue(now);

    setElevatedSession();
    expect(isSessionElevated()).toBe(true);

    const storedValue = window.sessionStorage.getItem(ELEVATED_SESSION_STORAGE_KEY);
    expect(storedValue).toBe((now + DEFAULT_ELEVATION_DURATION_MS).toString());

    // Advance time beyond 5 minutes
    vi.spyOn(Date, "now").mockReturnValue(now + DEFAULT_ELEVATION_DURATION_MS + 1000);
    expect(isSessionElevated()).toBe(false);
  });

  it("clears elevated session immediately", () => {
    setElevatedSession();
    expect(isSessionElevated()).toBe(true);

    clearElevatedSession();
    expect(isSessionElevated()).toBe(false);
    expect(window.sessionStorage.getItem(ELEVATED_SESSION_STORAGE_KEY)).toBeNull();
  });
});

describe("BiometricReAuthModal", () => {
  const onSuccessMock = vi.fn();
  const onCancelMock = vi.fn();
  const actionDescription = "reveal private recovery phrase";

  beforeEach(() => {
    window.sessionStorage.clear();
    vi.restoreAllMocks();
    onSuccessMock.mockClear();
    onCancelMock.mockClear();

    // Mock navigator.credentials
    Object.defineProperty(window.navigator, "credentials", {
      value: {
        get: vi.fn(),
      },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    window.sessionStorage.clear();
  });

  it("renders modal dialog with action description", () => {
    render(
      <BiometricReAuthModal
        actionDescription={actionDescription}
        onSuccess={onSuccessMock}
        onCancel={onCancelMock}
      />
    );

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /security re-authentication/i })).toBeInTheDocument();
    expect(screen.getByText(new RegExp(actionDescription, "i"))).toBeInTheDocument();
  });

  it("invokes onCancel when the Cancel button is clicked", () => {
    render(
      <BiometricReAuthModal
        actionDescription={actionDescription}
        onSuccess={onSuccessMock}
        onCancel={onCancelMock}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onCancelMock).toHaveBeenCalledTimes(1);
    expect(onSuccessMock).not.toHaveBeenCalled();
  });

  it("triggers WebAuthn assertion with userVerification required and succeeds", async () => {
    const mockCredentialsGet = vi.fn().mockResolvedValue({
      id: "credential-id-123",
      type: "public-key",
    });
    window.navigator.credentials.get = mockCredentialsGet;

    render(
      <BiometricReAuthModal
        actionDescription={actionDescription}
        onSuccess={onSuccessMock}
        onCancel={onCancelMock}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /verify with passkey/i }));

    await waitFor(() => {
      expect(mockCredentialsGet).toHaveBeenCalledTimes(1);
    });

    const options = mockCredentialsGet.mock.calls[0][0];
    expect(options.publicKey.userVerification).toBe("required");
    expect(options.publicKey.timeout).toBe(60000);

    await waitFor(() => {
      expect(onSuccessMock).toHaveBeenCalledTimes(1);
    });
    expect(isSessionElevated()).toBe(true);
  });

  it("displays an error alert when WebAuthn rejects or fails", async () => {
    const mockCredentialsGet = vi
      .fn()
      .mockRejectedValue(new Error("Biometric sensor timeout"));
    window.navigator.credentials.get = mockCredentialsGet;

    render(
      <BiometricReAuthModal
        actionDescription={actionDescription}
        onSuccess={onSuccessMock}
        onCancel={onCancelMock}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /verify with passkey/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });

    expect(screen.getByText(/biometric sensor timeout/i)).toBeInTheDocument();
    expect(onSuccessMock).not.toHaveBeenCalled();
    expect(isSessionElevated()).toBe(false);
  });

  it("displays an error message when browser does not support WebAuthn", async () => {
    Object.defineProperty(window.navigator, "credentials", {
      value: undefined,
      writable: true,
      configurable: true,
    });

    render(
      <BiometricReAuthModal
        actionDescription={actionDescription}
        onSuccess={onSuccessMock}
        onCancel={onCancelMock}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /verify with passkey/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });

    expect(
      screen.getByText(/not supported by this browser/i)
    ).toBeInTheDocument();
    expect(onSuccessMock).not.toHaveBeenCalled();
  });
});
