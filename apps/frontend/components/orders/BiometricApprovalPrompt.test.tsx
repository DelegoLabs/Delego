import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BiometricApprovalPrompt } from "./BiometricApprovalPrompt";

const ORIGINAL_SECURE = window.isSecureContext;

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

function decodeBase64Url(value: string): number[] {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  return Array.from(
    atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, "=")),
    (char) => char.charCodeAt(0)
  );
}

beforeEach(() => {
  Object.defineProperty(window, "isSecureContext", {
    value: ORIGINAL_SECURE,
    configurable: true,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  Object.defineProperty(window, "isSecureContext", {
    value: ORIGINAL_SECURE,
    configurable: true,
  });
});

describe("BiometricApprovalPrompt", () => {
  it("points unsupported devices straight at the wallet PIN", () => {
    installWebAuthn(async () => resolvingCredential());
    Object.defineProperty(window, "isSecureContext", { value: false, configurable: true });

    render(<BiometricApprovalPrompt orderId="order-1" amount="1,500 XLM" onSuccess={vi.fn()} onError={vi.fn()} />);

    expect(screen.getByTestId("biometric-unsupported")).toHaveTextContent(/wallet PIN/i);
    expect(screen.queryByTestId("biometric-start")).not.toBeInTheDocument();
  });

  it("renders the fingerprint affordance and starts on all 3 attempts", async () => {
    installWebAuthn(async () => resolvingCredential());

    render(<BiometricApprovalPrompt orderId="order-1" amount="1,500 XLM" onSuccess={vi.fn()} onError={vi.fn()} />);

    // Flush the async platform-authenticator probe inside `act` so its state
    // update is accounted for.
    await act(async () => {});

    expect(screen.getByTestId("biometric-glyph")).toBeInTheDocument();
    expect(screen.getByTestId("biometric-glyph")).toHaveAttribute("data-scanning", "false");
    expect(screen.getByTestId("biometric-attempt-count")).toHaveTextContent(
      "3 of 3 biometric attempts remaining."
    );
  });

  it("calls onSuccess with the assertion payload", async () => {
    installWebAuthn(async () => resolvingCredential());
    const onSuccess = vi.fn();
    const user = userEvent.setup();

    render(<BiometricApprovalPrompt orderId="order-1" amount="1,500 XLM" onSuccess={onSuccess} onError={vi.fn()} />);

    await user.click(screen.getByTestId("biometric-start"));

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    const payload = JSON.parse(onSuccess.mock.calls[0][0]);
    expect(payload.orderId).toBe("order-1");
    expect(payload.amount).toBe("1,500 XLM");
    expect(decodeBase64Url(payload.signature)).toEqual([5, 6, 7]);
  });

  it("animates while a scan is in flight", async () => {
    let release: (value: Credential) => void = () => {};
    installWebAuthn(
      () =>
        new Promise<Credential | null>((resolve) => {
          release = resolve;
        })
    );
    const user = userEvent.setup();

    render(<BiometricApprovalPrompt orderId="order-1" amount="1,500 XLM" onSuccess={vi.fn()} onError={vi.fn()} />);

    await user.click(screen.getByTestId("biometric-start"));

    expect(screen.getByTestId("biometric-glyph")).toHaveAttribute("data-scanning", "true");
    expect(screen.getByTestId("biometric-glyph").className).toContain("is-scanning");
    expect(screen.getByRole("button", { name: "Verifying…" })).toBeDisabled();

    release(resolvingCredential());
    await waitFor(() =>
      expect(screen.getByTestId("biometric-glyph")).toHaveAttribute("data-scanning", "false")
    );
  });

  it("reports a cancellation without consuming the PIN fallback", async () => {
    installWebAuthn(async () => {
      throw new DOMException("cancelled", "NotAllowedError");
    });
    const onError = vi.fn();
    const user = userEvent.setup();

    render(<BiometricApprovalPrompt orderId="order-1" amount="1,500 XLM" onSuccess={vi.fn()} onError={onError} />);

    await user.click(screen.getByTestId("biometric-start"));

    await waitFor(() => expect(onError).toHaveBeenCalledTimes(0));
    expect(screen.getByTestId("biometric-error")).toHaveTextContent(/cancelled/i);
    expect(screen.getByTestId("biometric-attempt-count")).toHaveTextContent(
      "2 of 3 biometric attempts remaining."
    );
    expect(screen.queryByTestId("biometric-fallback")).not.toBeInTheDocument();
  });

  // ─── Fallback after 3 failures (#724 acceptance criterion) ────────────────

  it("falls back to the wallet PIN after 3 failed biometric attempts", async () => {
    installWebAuthn(async () => {
      throw new DOMException("cancelled", "NotAllowedError");
    });
    const onError = vi.fn();
    const onSuccess = vi.fn();
    const user = userEvent.setup();

    render(<BiometricApprovalPrompt orderId="order-1" amount="1,500 XLM" onSuccess={onSuccess} onError={onError} />);

    await user.click(screen.getByTestId("biometric-start"));
    await waitFor(() =>
      expect(screen.getByTestId("biometric-attempt-count")).toHaveTextContent("2 of 3")
    );

    await user.click(screen.getByTestId("biometric-start"));
    await waitFor(() =>
      expect(screen.getByTestId("biometric-attempt-count")).toHaveTextContent("1 of 3")
    );

    // Third failure tips the component into the PIN fallback.
    await user.click(screen.getByTestId("biometric-start"));
    await waitFor(() =>
      expect(screen.getByTestId("biometric-fallback")).toBeInTheDocument()
    );

    expect(screen.getByTestId("biometric-fallback")).toHaveTextContent(/wallet PIN/i);
    expect(screen.getByTestId("biometric-fallback")).toHaveTextContent("1,500 XLM");
    expect(onError).toHaveBeenCalledWith(expect.stringContaining("3 times"));
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("stops offering biometrics once the fallback is showing", async () => {
    installWebAuthn(async () => {
      throw new DOMException("cancelled", "NotAllowedError");
    });
    const user = userEvent.setup();

    render(<BiometricApprovalPrompt orderId="order-1" amount="1,500 XLM" onSuccess={vi.fn()} onError={vi.fn()} />);

    // The first two failures keep the biometric button available.
    for (const remaining of ["2 of 3", "1 of 3"]) {
      await user.click(screen.getByTestId("biometric-start"));
      await waitFor(() =>
        expect(screen.getByTestId("biometric-attempt-count")).toHaveTextContent(remaining)
      );
    }

    // The third failure replaces the whole prompt with the PIN affordance.
    await user.click(screen.getByTestId("biometric-start"));
    await waitFor(() =>
      expect(screen.getByTestId("biometric-fallback")).toBeInTheDocument()
    );

    expect(screen.queryByTestId("biometric-start")).not.toBeInTheDocument();
    expect(screen.queryByTestId("biometric-attempt-count")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Approve with wallet PIN" })
    ).toBeInTheDocument();
  });

  it("hands control back to the host when the user picks the wallet PIN", async () => {
    installWebAuthn(async () => {
      throw new DOMException("cancelled", "NotAllowedError");
    });
    const onPinFallback = vi.fn();
    const user = userEvent.setup();

    render(
      <BiometricApprovalPrompt
        orderId="order-1"
        amount="1,500 XLM"
        onSuccess={vi.fn()}
        onError={vi.fn()}
        onPinFallback={onPinFallback}
      />
    );

    for (let i = 0; i < 3; i += 1) {
      await user.click(screen.getByTestId("biometric-start"));
      await waitFor(() => {
        if (i === 2) {
          expect(screen.getByTestId("biometric-fallback")).toBeInTheDocument();
        } else {
          expect(screen.getByTestId("biometric-attempt-count")).toHaveTextContent(
            `${2 - i} of 3`
          );
        }
      });
    }

    await user.click(screen.getByTestId("biometric-pin-fallback"));
    expect(onPinFallback).toHaveBeenCalledTimes(1);
  });

  it("resets the attempt budget after a successful verification", async () => {
    let attempts = 0;
    installWebAuthn(async () => {
      attempts += 1;
      if (attempts === 1) throw new DOMException("cancelled", "NotAllowedError");
      return resolvingCredential();
    });
    const onSuccess = vi.fn();
    const user = userEvent.setup();

    render(<BiometricApprovalPrompt orderId="order-1" amount="1,500 XLM" onSuccess={onSuccess} onError={vi.fn()} />);

    await user.click(screen.getByTestId("biometric-start"));
    await waitFor(() =>
      expect(screen.getByTestId("biometric-attempt-count")).toHaveTextContent("2 of 3")
    );

    await user.click(screen.getByTestId("biometric-start"));
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId("biometric-attempt-count")).toHaveTextContent(
      "3 of 3 biometric attempts remaining."
    );
  });
});
