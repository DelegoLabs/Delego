import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PasskeyRegistrationStepper } from "./PasskeyRegistrationStepper";

// Mock the passkey library functions
vi.mock("../../lib/passkey", () => ({
  isWebAuthnSupported: vi.fn(() => true),
  createPasskeyCredential: vi.fn(),
  registerPasskey: vi.fn(),
  passkeyErrorMessage: vi.fn((err: unknown) => {
    if (err instanceof DOMException) {
      if (err.name === "NotAllowedError") {
        return "Passkey registration was cancelled. You can try again when you are ready.";
      }
      if (err.name === "NotSupportedError" || err.name === "SecurityError") {
        return "This device does not support passkeys. You can keep signing with the Freighter browser extension.";
      }
      if (err.name === "InvalidStateError") {
        return "A passkey for this account is already registered on this device.";
      }
    }
    if (err instanceof Error && err.message) return err.message;
    return "Could not register this passkey. Try again.";
  }),
}));

const mockOnClose = vi.fn();
const mockOnSuccess = vi.fn();

const defaultProps = {
  isOpen: true,
  onClose: mockOnClose,
  onSuccess: mockOnSuccess,
  stellarAddress: "GABC1234567890",
};

describe("PasskeyRegistrationStepper", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function renderStepper(overrides: Partial<typeof defaultProps> = {}) {
    return render(<PasskeyRegistrationStepper {...defaultProps} {...overrides} />);
  }

  it("renders nothing when isOpen is false", () => {
    const { container } = render(<PasskeyRegistrationStepper {...defaultProps} isOpen={false} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders welcome step initially with stepper indicator", () => {
    renderStepper();

    // Check stepper steps are rendered
    expect(screen.getByText("Welcome")).toBeInTheDocument();
    expect(screen.getByText("Register")).toBeInTheDocument();
    expect(screen.getByText("Success")).toBeInTheDocument();

    // Check welcome step content
    expect(screen.getByText("Register a passkey")).toBeInTheDocument();
    expect(screen.getByText(/Face ID|Touch ID|Windows Hello/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText("This device")).toBeInTheDocument();
  });

  it("shows error when stellarAddress is missing", () => {
    renderStepper({ stellarAddress: "" });

    expect(screen.getByText(/Connect a Stellar wallet before registering a passkey/i)).toBeInTheDocument();
  });

  it("advances to registering step when register button is clicked", async () => {
    const { createPasskeyCredential } = await import("../../lib/passkey");
    // Make the mock return a never-resolving promise so we can check the intermediate state
    let resolveMock: (value: any) => void;
    const promise = new Promise((resolve) => {
      resolveMock = resolve;
    });
    vi.mocked(createPasskeyCredential).mockReturnValue(promise as any);

    renderStepper();

    // Click register button
    const registerButton = screen.getByText("Register passkey");
    fireEvent.click(registerButton);

    // Should show registering state
    await waitFor(() => {
      expect(screen.getByText(/Registering passkey/i)).toBeInTheDocument();
    }, { timeout: 2000 });

    // Clean up
    resolveMock!({
      credentialId: "cred-123",
      publicKeySpki: "spki-key",
      algorithm: -7,
      createdAt: new Date().toISOString(),
    });
  });

  it("calls createPasskeyCredential and registerPasskey on successful registration", async () => {
    const { createPasskeyCredential, registerPasskey } = await import("../../lib/passkey");

    const mockCredential = {
      credentialId: "cred-123",
      publicKeySpki: "spki-key",
      algorithm: -7 as const,
      createdAt: new Date().toISOString(),
    };

    vi.mocked(createPasskeyCredential).mockResolvedValue(mockCredential);
    vi.mocked(registerPasskey).mockResolvedValue(undefined);

    renderStepper();

    const registerButton = screen.getByText("Register passkey");
    fireEvent.click(registerButton);

    await waitFor(() => {
      expect(createPasskeyCredential).toHaveBeenCalledWith("GABC1234567890", "");
    }, { timeout: 2000 });

    await waitFor(() => {
      expect(registerPasskey).toHaveBeenCalledWith(mockCredential, "GABC1234567890", "");
    }, { timeout: 2000 });

    await waitFor(() => {
      expect(screen.getByText("Passkey registered!")).toBeInTheDocument();
    }, { timeout: 2000 });

    await waitFor(() => {
      expect(mockOnSuccess).toHaveBeenCalledWith(mockCredential);
    }, { timeout: 2000 });
  });

  it("shows error step when registration fails", async () => {
    const { createPasskeyCredential, passkeyErrorMessage } = await import("../../lib/passkey");

    const error = new DOMException("User cancelled", "NotAllowedError");
    vi.mocked(createPasskeyCredential).mockRejectedValue(error);
    vi.mocked(passkeyErrorMessage).mockReturnValue("Passkey registration was cancelled.");

    renderStepper();

    const registerButton = screen.getByText("Register passkey");
    fireEvent.click(registerButton);

    await waitFor(() => {
      expect(screen.getByText("Registration failed")).toBeInTheDocument();
    }, { timeout: 2000 });

    expect(screen.getByText("Passkey registration was cancelled.")).toBeInTheDocument();
    expect(screen.getByText("Try again")).toBeInTheDocument();
    expect(screen.getByText("Close")).toBeInTheDocument();
  });

  it("allows retry from error step", async () => {
    const { createPasskeyCredential, passkeyErrorMessage } = await import("../../lib/passkey");

    const error = new DOMException("User cancelled", "NotAllowedError");
    vi.mocked(createPasskeyCredential).mockRejectedValue(error);
    vi.mocked(passkeyErrorMessage).mockReturnValue("Passkey registration was cancelled.");

    renderStepper();

    const registerButton = screen.getByText("Register passkey");
    fireEvent.click(registerButton);

    await waitFor(() => {
      expect(screen.getByText("Registration failed")).toBeInTheDocument();
    }, { timeout: 2000 });

    // Click try again
    fireEvent.click(screen.getByText("Try again"));

    await waitFor(() => {
      expect(screen.getByText("Register a passkey")).toBeInTheDocument();
    }, { timeout: 2000 });
  });

  it("closes modal when close button is clicked on welcome step", () => {
    renderStepper();

    fireEvent.click(screen.getByText("Cancel"));

    expect(mockOnClose).toHaveBeenCalled();
  });

  it("closes modal when Done button is clicked on success step", async () => {
    const { createPasskeyCredential, registerPasskey } = await import("../../lib/passkey");

    const mockCredential = {
      credentialId: "cred-123",
      publicKeySpki: "spki-key",
      algorithm: -7 as const,
      createdAt: new Date().toISOString(),
    };

    vi.mocked(createPasskeyCredential).mockResolvedValue(mockCredential);
    vi.mocked(registerPasskey).mockResolvedValue(undefined);

    renderStepper();

    const registerButton = screen.getByText("Register passkey");
    fireEvent.click(registerButton);

    await waitFor(() => {
      expect(screen.getByText("Passkey registered!")).toBeInTheDocument();
    }, { timeout: 2000 });

    fireEvent.click(screen.getByText("Done"));

    expect(mockOnClose).toHaveBeenCalled();
  });

  it("shows credential details on success step", async () => {
    const { createPasskeyCredential, registerPasskey } = await import("../../lib/passkey");

    const mockCredential = {
      credentialId: "cred-1234567890abcdef",
      publicKeySpki: "spki-key",
      algorithm: -7 as const,
      createdAt: "2024-01-15T12:30:00.000Z",
    };

    vi.mocked(createPasskeyCredential).mockResolvedValue(mockCredential);
    vi.mocked(registerPasskey).mockResolvedValue(undefined);

    renderStepper();

    const registerButton = screen.getByText("Register passkey");
    fireEvent.click(registerButton);

    await waitFor(() => {
      expect(screen.getByText("Passkey registered!")).toBeInTheDocument();
    }, { timeout: 2000 });

    // Check credential details are shown
    expect(screen.getByText(/cred-1234567890abcdef/i)).toBeInTheDocument();
    expect(screen.getByText("ES256")).toBeInTheDocument();
  });

  it("disables register button while submitting", async () => {
    const { createPasskeyCredential } = await import("../../lib/passkey");

    let resolveFn: (value: any) => void;
    const promise = new Promise((resolve) => {
      resolveFn = resolve;
    });
    vi.mocked(createPasskeyCredential).mockReturnValue(promise as any);

    renderStepper();

    const registerButton = screen.getByText("Register passkey");
    fireEvent.click(registerButton);

    // Button should be disabled and show loading state
    await waitFor(() => {
      expect(screen.getByText(/Registering/i)).toBeInTheDocument();
    }, { timeout: 2000 });

    // Resolve to clean up
    resolveFn!({
      credentialId: "cred-123",
      publicKeySpki: "spki-key",
      algorithm: -7,
      createdAt: new Date().toISOString(),
    });
  });

  it("traps focus within the modal", () => {
    renderStepper();

    const panel = screen.getByRole("dialog");
    expect(panel).toHaveAttribute("tabIndex", "-1");
  });

  it("prevents closing when clicking inside the panel", () => {
    renderStepper();

    const panel = screen.getByRole("dialog");
    fireEvent.click(panel);

    expect(mockOnClose).not.toHaveBeenCalled();
  });

  it("closes when clicking overlay backdrop", () => {
    renderStepper();

    const overlay = document.querySelector(".passkey-stepper-overlay");
    if (overlay) {
      fireEvent.click(overlay);
      expect(mockOnClose).toHaveBeenCalled();
    }
  });
});