import { useRef, useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { BiometricCheckoutPrompt, type FocusRestoreOptions } from "./BiometricCheckoutPrompt";

vi.mock("../../lib/apiFetch", () => ({
  apiFetch: vi.fn(),
}));

function hangWebAuthn() {
  class FakePublicKeyCredential {
    static async isUserVerifyingPlatformAuthenticatorAvailable() {
      return true;
    }
  }
  vi.stubGlobal("PublicKeyCredential", FakePublicKeyCredential);
  Object.defineProperty(window, "isSecureContext", { value: true, configurable: true });
  Object.defineProperty(navigator, "credentials", {
    value: { get: vi.fn(() => new Promise(() => undefined)) },
    configurable: true,
  });
}

function Harness({ onCancel }: { onCancel?: () => void }) {
  return (
    <>
      <button type="button" data-testid="pay-trigger" onClick={onCancel}>
        Pay
      </button>
      <button type="button">Outside the dialog</button>
      <BiometricCheckoutPrompt
        orderAmount="2.50 XLM"
        merchantName="Coffee Cart"
        onSuccess={vi.fn()}
        onCancel={onCancel}
      />
    </>
  );
}

beforeEach(() => {
  hangWebAuthn();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("BiometricCheckoutPrompt focus trap (#900)", () => {
  it("focuses Passkey Sign and keeps Tab inside the dialog", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const passkey = await screen.findByTestId("biometric-checkout-passkey");
    await waitFor(() => expect(passkey).toHaveFocus());

    await user.tab();
    expect(screen.getByTestId("biometric-checkout-cancel")).toHaveFocus();

    await user.tab();
    expect(passkey).toHaveFocus();

    const dialog = screen.getByTestId("biometric-checkout-modal");
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(screen.getByText("Outside the dialog")).not.toHaveFocus();
  });

  it("returns focus to the trigger when the dialog is dismissed", async () => {
    const user = userEvent.setup();

    function Openable() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" data-testid="pay-trigger" onClick={() => setOpen(true)}>
            Pay
          </button>
          <button type="button">Outside the dialog</button>
          {open ? (
            <BiometricCheckoutPrompt
              orderAmount="2.50 XLM"
              merchantName="Coffee Cart"
              onSuccess={vi.fn()}
              onCancel={() => setOpen(false)}
            />
          ) : null}
        </>
      );
    }

    render(<Openable />);
    await user.click(screen.getByTestId("pay-trigger"));

    const passkey = await screen.findByTestId("biometric-checkout-passkey");
    await waitFor(() => expect(passkey).toHaveFocus());

    await user.click(screen.getByTestId("biometric-checkout-cancel"));
    await waitFor(() => expect(screen.getByTestId("pay-trigger")).toHaveFocus());
    expect(screen.queryByTestId("biometric-checkout-modal")).not.toBeInTheDocument();
  });
  it("restores focus to the trigger when dismissed with the Escape key", async () => {
    const user = userEvent.setup();

    function OpenableEsc() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" data-testid="pay-trigger-esc" onClick={() => setOpen(true)}>
            Pay
          </button>
          {open ? (
            <BiometricCheckoutPrompt
              orderAmount="2.50 XLM"
              merchantName="Coffee Cart"
              onSuccess={vi.fn()}
              onCancel={() => setOpen(false)}
            />
          ) : null}
        </>
      );
    }

    render(<OpenableEsc />);
    await user.click(screen.getByTestId("pay-trigger-esc"));

    const passkey = await screen.findByTestId("biometric-checkout-passkey");
    await waitFor(() => expect(passkey).toHaveFocus());

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.getByTestId("pay-trigger-esc")).toHaveFocus());
    expect(screen.queryByTestId("biometric-checkout-modal")).not.toBeInTheDocument();
  });

  it("restores focus to explicit triggerRef upon modal close", async () => {
    const user = userEvent.setup();

    function OpenableRef() {
      const [open, setOpen] = useState(false);
      const triggerRef = useRef<HTMLButtonElement>(null);
      return (
        <>
          <button ref={triggerRef} type="button" data-testid="pay-trigger-explicit" onClick={() => setOpen(true)}>
            Pay
          </button>
          {open ? (
            <BiometricCheckoutPrompt
              orderAmount="2.50 XLM"
              merchantName="Coffee Cart"
              onSuccess={vi.fn()}
              onClose={() => setOpen(false)}
              triggerRef={triggerRef}
            />
          ) : null}
        </>
      );
    }

    render(<OpenableRef />);
    await user.click(screen.getByTestId("pay-trigger-explicit"));

    const passkey = await screen.findByTestId("biometric-checkout-passkey");
    await waitFor(() => expect(passkey).toHaveFocus());

    await user.click(screen.getByTestId("biometric-checkout-cancel"));
    await waitFor(() => expect(screen.getByTestId("pay-trigger-explicit")).toHaveFocus());
    expect(screen.queryByTestId("biometric-checkout-modal")).not.toBeInTheDocument();
  });
});
