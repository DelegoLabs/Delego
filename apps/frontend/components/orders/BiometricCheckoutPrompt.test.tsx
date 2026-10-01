import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { BiometricCheckoutPrompt, parseAssertion } from "./BiometricCheckoutPrompt";

const apiFetchMock = vi.fn();

vi.mock("../../lib/apiFetch", () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
}));

vi.mock("../../hooks/useFocusTrap", () => ({
  useFocusTrap: () => undefined,
}));

vi.mock("@delegolabs/ui", () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string }) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
}));

function installWebAuthn(get: (request?: CredentialRequestOptions) => Promise<Credential | null>) {
  class FakePublicKeyCredential {
    static async isUserVerifyingPlatformAuthenticatorAvailable() {
      return true;
    }
  }
  vi.stubGlobal("PublicKeyCredential", FakePublicKeyCredential);
  Object.defineProperty(window, "isSecureContext", { value: true, configurable: true });
  Object.defineProperty(navigator, "credentials", {
    value: { get: vi.fn(get) },
    configurable: true,
  });
}

function resolvingCredential(): Credential {
  return {
    type: "public-key",
    rawId: new Uint8Array([1, 2, 3, 4]).buffer,
    response: {
      authenticatorData: new Uint8Array([9, 9]).buffer,
      clientDataJSON: new Uint8Array([7]).buffer,
      signature: new Uint8Array([5, 6, 7]).buffer,
      userHandle: null,
    },
  } as unknown as Credential;
}

beforeEach(() => {
  apiFetchMock.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("parseAssertion", () => {
  it("normalizes missing userHandle to null", () => {
    const parsed = parseAssertion(
      JSON.stringify({
        credentialId: "abc",
        authenticatorData: "ad",
        clientDataJSON: "cd",
        signature: "sig",
      })
    );
    expect(parsed.credentialId).toBe("abc");
    expect(parsed.userHandle).toBeNull();
  });
});

describe("BiometricCheckoutPrompt", () => {
  it("shows amount and merchant, then succeeds after gateway accept", async () => {
    installWebAuthn(async () => resolvingCredential());
    apiFetchMock.mockResolvedValue({ data: { ok: true }, error: null });
    const onSuccess = vi.fn();

    render(
      <BiometricCheckoutPrompt
        orderAmount="2.50 XLM"
        merchantName="Coffee Cart"
        onSuccess={onSuccess}
      />
    );

    expect(screen.getByTestId("biometric-checkout-amount")).toHaveTextContent("2.50 XLM");
    expect(screen.getByText(/Coffee Cart/)).toBeInTheDocument();

    await waitFor(() => expect(screen.getByTestId("biometric-checkout-success")).toBeInTheDocument());
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(apiFetchMock).toHaveBeenCalledWith(
      "/checkout/biometric",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("surfaces an error when the gateway rejects the assertion", async () => {
    installWebAuthn(async () => resolvingCredential());
    apiFetchMock.mockResolvedValue({
      data: null,
      error: { message: "Assertion rejected" },
    });

    render(
      <BiometricCheckoutPrompt orderAmount="1 XLM" merchantName="Newsstand" onSuccess={vi.fn()} />
    );

    await waitFor(() => expect(screen.getByTestId("biometric-checkout-error")).toBeInTheDocument());
    expect(screen.getByTestId("biometric-checkout-error")).toHaveTextContent(/Assertion rejected|failed/i);
  });

  it("cancel button invokes onCancel", async () => {
    installWebAuthn(async () => {
      await new Promise((r) => setTimeout(r, 50));
      return resolvingCredential();
    });
    apiFetchMock.mockResolvedValue({ data: { ok: true }, error: null });
    const onCancel = vi.fn();

    render(
      <BiometricCheckoutPrompt
        orderAmount="1 XLM"
        merchantName="Kiosk"
        onSuccess={vi.fn()}
        onCancel={onCancel}
      />
    );

    await userEvent.click(screen.getByTestId("biometric-checkout-cancel"));
    expect(onCancel).toHaveBeenCalled();
  });
});
