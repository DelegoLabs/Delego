/**
 * Integration tests for TaxEnabledCheckoutFlow and related components.
 * Tests the complete tax calculation integration across the checkout process.
 */

import { webcrypto } from "node:crypto";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { Order } from "@delegolabs/types";
import { TaxEnabledCheckoutFlow, TaxAwareApprovalCard } from "./TaxEnabledCheckoutFlow";
import type { DeliveryNoteOrderMetadata } from "../../lib/deliveryInstructions";

// Mock dependencies
vi.mock("../../hooks/useCurrency", () => ({
  useCurrency: () => ({
    currencyId: "xlm",
    rate: { xlmUsdRate: 1.0 },
  }),
}));

vi.mock("@delegolabs/ui", () => ({
  Amount: ({ stroops }: { stroops: bigint }) => <span data-testid="amount">{stroops.toString()}</span>,
  Badge: ({ children, tone }: { children: React.ReactNode; tone: string }) => (
    <span data-testid="badge" data-tone={tone}>{children}</span>
  ),
  Card: ({ children, title }: { children: React.ReactNode; title: string }) => (
    <div data-testid="card" data-title={title}>
      {title ? <h3>{title}</h3> : null}
      {children}
    </div>
  ),
  Button: ({ children, onClick, variant }: { 
    children: React.ReactNode; 
    onClick?: () => void; 
    variant?: string;
  }) => (
    <button onClick={onClick} data-variant={variant}>{children}</button>
  ),
  FormField: ({
    children,
    label,
    hint,
    error,
    inputProps,
  }: {
    children: React.ReactNode;
    label: string;
    hint?: string;
    error?: string;
    inputProps?: { id?: string };
  }) => (
    <div>
      <label htmlFor={inputProps?.id}>{label}</label>
      {hint ? <p id={`${inputProps?.id}-hint`}>{hint}</p> : null}
      {children}
      {error ? (
        <p id={`${inputProps?.id}-error`} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  ),
}));

// Mock other components. Like the real ApprovalCard, a rejected onApprove
// is caught (the real card announces the failure).
vi.mock("./ApprovalCard", () => ({
  ApprovalCard: ({ order, deliveryPostalCode, onApprove, onReject }: any) => (
    <div data-testid="approval-card" data-postal-code={deliveryPostalCode ?? ""}>
      <button
        onClick={() => {
          Promise.resolve(onApprove(order.id)).catch(() => {});
        }}
        data-testid="approve-btn"
      >
        Approve
      </button>
      <button onClick={() => onReject(order.id, "test reason")} data-testid="reject-btn">
        Reject
      </button>
    </div>
  ),
}));

// Mirrors the real `ReceiptPanel`, which takes an `Order` plus optional
// jurisdiction/category — it has no `deliveryPostalCode` prop.
vi.mock("./ReceiptPanel", () => ({
  ReceiptPanel: ({ order, jurisdictionCode, category }: any) => (
    <div
      data-testid="receipt-panel"
      data-order-id={order?.id}
      data-jurisdiction={jurisdictionCode ?? ""}
      data-category={category ?? ""}
    >
      Receipt with tax
    </div>
  ),
}));

const mockOrder: Order = {
  id: "test-order-123",
  userId: "user-123",
  delegationId: "delegation-123",
  merchantId: "merchant-123",
  status: "pending_approval",
  totalStroops: "1000000000", // 100 XLM
  lineItems: [
    {
      productId: "product-1",
      quantity: 2,
      unitPriceStroops: "300000000", // 30 XLM each
    },
    {
      productId: "product-2", 
      quantity: 1,
      unitPriceStroops: "400000000", // 40 XLM
    },
  ],
  escrowContractId: null,
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z",
};

function fillValidDeliveryAddress(postalCode = "90210") {
  fireEvent.change(screen.getByPlaceholderText("123 Main St"), {
    target: { value: "123 Main St" },
  });
  fireEvent.change(screen.getByPlaceholderText("Enter postal code"), {
    target: { value: postalCode },
  });
}

describe("TaxEnabledCheckoutFlow", () => {
  test("renders tax preview mode", () => {
    render(
      <TaxEnabledCheckoutFlow
        order={mockOrder}
        mode="tax-preview"
        initialPostalCode="90210"
      />
    );

    expect(screen.getByDisplayValue("90210")).toBeInTheDocument();
    expect(screen.getByText("Tax Calculation Preview")).toBeInTheDocument();
  });

  test("allows postal code input and shows tax breakdown", () => {
    render(
      <TaxEnabledCheckoutFlow
        order={mockOrder}
        mode="full"
      />
    );

    fillValidDeliveryAddress();
    const postalInput = screen.getByPlaceholderText("Enter postal code");

    expect(postalInput).toHaveValue("90210");
    expect(screen.getAllByText("Tax Calculation").length).toBeGreaterThan(0);
  });

  test("shows approval card with postal code when provided", () => {
    render(
      <TaxEnabledCheckoutFlow
        order={mockOrder}
        initialPostalCode="90210"
        mode="full"
      />
    );

    const approvalCard = screen.getByTestId("approval-card");
    expect(approvalCard).toHaveAttribute("data-postal-code", "90210");
  });

  test("handles approval with tax calculation", async () => {
    const onApprove = vi.fn();
    
    render(
      <TaxEnabledCheckoutFlow
        order={mockOrder}
        initialPostalCode="90210"
        onApprove={onApprove}
        mode="full"
      />
    );

    fillValidDeliveryAddress();
    const approveBtn = screen.getByTestId("approve-btn");
    fireEvent.click(approveBtn);

    await waitFor(() => {
      expect(onApprove).toHaveBeenCalledWith("test-order-123", expect.any(BigInt));
    });
  });

  test("handles rejection", async () => {
    const onReject = vi.fn();
    
    render(
      <TaxEnabledCheckoutFlow
        order={mockOrder}
        initialPostalCode="90210"
        onReject={onReject}
        mode="full"
      />
    );

    const rejectBtn = screen.getByTestId("reject-btn");
    fireEvent.click(rejectBtn);

    await waitFor(() => {
      expect(onReject).toHaveBeenCalledWith("test-order-123", "test reason");
    });
  });

  test("shows receipt mode", () => {
    render(
      <TaxEnabledCheckoutFlow
        order={mockOrder}
        initialPostalCode="90210"
        mode="receipt"
      />
    );

    const receiptPanel = screen.getByTestId("receipt-panel");
    expect(receiptPanel).toHaveAttribute("data-order-id", "test-order-123");
    expect(screen.getByText("Receipt with tax")).toBeInTheDocument();
  });

  test("shows integration notes in full mode", () => {
    render(
      <TaxEnabledCheckoutFlow
        order={mockOrder}
        mode="full"
      />
    );

    expect(screen.getByText("Integration Notes")).toBeInTheDocument();
    expect(screen.getByText("Tax Integration Points:")).toBeInTheDocument();
    expect(screen.getByText("Postal code drives tax jurisdiction lookup")).toBeInTheDocument();
  });
});

describe("useTaxEnabledOrder hook", () => {
  // Note: Testing React hooks requires renderHook from @testing-library/react-hooks
  // For this test, we'll test the hook indirectly through component usage
  
  test("calculates correct subtotal from line items", () => {
    // Subtotal should be: (30 * 2) + (40 * 1) = 100 XLM = 1000000000 stroops
    const subtotal = (mockOrder.lineItems ?? []).reduce((sum, item) => {
      return sum + (BigInt(item.unitPriceStroops) * BigInt(item.quantity));
    }, 0n);
    
    expect(subtotal).toBe(BigInt("1000000000")); // 100 XLM
  });
});

describe("TaxAwareApprovalCard", () => {
  test("passes postal code to ApprovalCard", () => {
    const mockProps = {
      order: mockOrder,
      postalCode: "90210",
      pending: false,
      onApprove: vi.fn(),
      onReject: vi.fn(),
    };

    render(<TaxAwareApprovalCard {...mockProps} />);

    const approvalCard = screen.getByTestId("approval-card");
    expect(approvalCard).toHaveAttribute("data-postal-code", "90210");
  });

  test("handles missing postal code gracefully", () => {
    const mockProps = {
      order: mockOrder,
      pending: false,
      onApprove: vi.fn(),
      onReject: vi.fn(),
    };

    render(<TaxAwareApprovalCard {...mockProps} />);

    const approvalCard = screen.getByTestId("approval-card");
    expect(approvalCard).toHaveAttribute("data-postal-code", "");
  });
});

describe("Integration scenarios", () => {
  test("complete checkout flow with California tax", async () => {
    const onApprove = vi.fn();
    const onReject = vi.fn();

    render(
      <TaxEnabledCheckoutFlow
        order={mockOrder}
        onApprove={onApprove}
        onReject={onReject}
        mode="full"
      />
    );

    // Enter California postal code
    fillValidDeliveryAddress();

    // Should show tax calculation
    expect(screen.getAllByText("Tax Calculation").length).toBeGreaterThan(0);

    // Approve the order
    const approveBtn = screen.getByTestId("approve-btn");
    fireEvent.click(approveBtn);

    // Should call onApprove with tax-inclusive amount
    await waitFor(() => {
      expect(onApprove).toHaveBeenCalledWith(
        "test-order-123", 
        expect.any(BigInt) // The amount should include calculated tax
      );
    });
  });

  test("checkout flow without postal code", () => {
    render(
      <TaxEnabledCheckoutFlow
        order={mockOrder}
        mode="full"
      />
    );

    // Should show postal code input
    expect(screen.getByPlaceholderText("Enter postal code")).toBeInTheDocument();
    
    // Should not show tax breakdown initially
    expect(screen.queryByText("Tax Calculation")).not.toBeInTheDocument();
  });

  test("receipt mode with tax", () => {
    render(
      <TaxEnabledCheckoutFlow
        order={mockOrder}
        initialPostalCode="10115" // Berlin, Germany
        mode="receipt"
      />
    );

    const receiptPanel = screen.getByTestId("receipt-panel");
    expect(receiptPanel).toHaveAttribute("data-order-id", "test-order-123");
  });
});

describe("Delivery instructions (#1005)", () => {
  const LABEL = "Delivery instructions (gate code, buzzer)";
  const GATE_CODE = "Gate code 4821#, buzzer 12B";
  let merchantPublicKey: string;
  let merchantPrivateKey: CryptoKey;

  beforeAll(async () => {
    // Pin Node's WebCrypto so the test does not depend on what the jsdom
    // environment exposes as `globalThis.crypto`.
    vi.stubGlobal("crypto", webcrypto);
    const pair = await globalThis.crypto.subtle.generateKey(
      {
        name: "RSA-OAEP",
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: "SHA-256",
      },
      true,
      ["encrypt", "decrypt"]
    );
    const spki = await globalThis.crypto.subtle.exportKey("spki", pair.publicKey);
    merchantPublicKey = Buffer.from(spki).toString("base64");
    merchantPrivateKey = pair.privateKey;
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  async function decryptAsMerchant(encryptedPayload: string): Promise<string> {
    const subtle = globalThis.crypto.subtle;
    const bytes = (value: string) => new Uint8Array(Buffer.from(value, "base64"));
    const envelope = JSON.parse(
      Buffer.from(encryptedPayload, "base64").toString("utf8")
    ) as { iv: string; key: string; ct: string };
    const rawKey = await subtle.decrypt(
      { name: "RSA-OAEP" },
      merchantPrivateKey,
      bytes(envelope.key)
    );
    const aesKey = await subtle.importKey("raw", rawKey, { name: "AES-GCM" }, false, [
      "decrypt",
    ]);
    const plaintext = await subtle.decrypt(
      { name: "AES-GCM", iv: bytes(envelope.iv) },
      aesKey,
      bytes(envelope.ct)
    );
    return new TextDecoder().decode(plaintext);
  }

  test("renders the field in the delivery step with a privacy hint", () => {
    render(
      <TaxEnabledCheckoutFlow
        order={mockOrder}
        merchantPublicKey={merchantPublicKey}
        mode="full"
      />
    );

    const field = screen.getByLabelText(LABEL);
    expect(field.tagName).toBe("TEXTAREA");
    expect(field).toBeEnabled();
    expect(field).toHaveAttribute("maxlength", "500");
    expect(field).toHaveAccessibleDescription(
      "Encrypted in your browser with the merchant's key. Only the merchant can read it."
    );
  });

  test("disables the field when the merchant has not published a key", () => {
    render(<TaxEnabledCheckoutFlow order={mockOrder} mode="full" />);

    const field = screen.getByLabelText(LABEL);
    expect(field).toBeDisabled();
    expect(field).toHaveAccessibleDescription(
      /has not published a delivery key/
    );
  });

  test("approves without metadata when no instructions were entered", async () => {
    const onApprove = vi.fn();
    render(
      <TaxEnabledCheckoutFlow
        order={mockOrder}
        merchantPublicKey={merchantPublicKey}
        onApprove={onApprove}
        mode="full"
      />
    );

    fillValidDeliveryAddress();
    fireEvent.click(screen.getByTestId("approve-btn"));

    await waitFor(() => expect(onApprove).toHaveBeenCalledTimes(1));
    expect(onApprove.mock.calls[0]).toHaveLength(2);
  });

  test("forwards only the encrypted note in the order metadata", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 204 }));
    const onApprove = vi.fn(
      async (
        orderId: string,
        _amount: bigint,
        metadata?: DeliveryNoteOrderMetadata
      ) => {
        // Stand-in for the caller's order request.
        await fetch(`https://api.example.com/orders/${orderId}`, {
          method: "PATCH",
          body: JSON.stringify({ metadata }),
        });
      }
    );

    try {
      render(
        <TaxEnabledCheckoutFlow
          order={mockOrder}
          merchantPublicKey={merchantPublicKey}
          onApprove={onApprove}
          mode="full"
        />
      );
      fillValidDeliveryAddress();
      fireEvent.change(screen.getByLabelText(LABEL), {
        target: { value: GATE_CODE },
      });
      fireEvent.click(screen.getByTestId("approve-btn"));

      await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));

      const metadata = onApprove.mock.calls[0][2];
      expect(onApprove).toHaveBeenCalledWith(
        "test-order-123",
        expect.any(BigInt),
        {
          encryptedDeliveryNote: {
            recipientInstructions: "encrypted",
            merchantPublicKey,
            encryptedPayload: expect.any(String),
          },
        }
      );

      const body = String(fetchSpy.mock.calls[0][1]?.body);
      expect(body).not.toContain(GATE_CODE);
      expect(body).not.toContain("Gate code");
      expect(body).toContain(metadata!.encryptedDeliveryNote.encryptedPayload);

      await expect(
        decryptAsMerchant(metadata!.encryptedDeliveryNote.encryptedPayload)
      ).resolves.toBe(GATE_CODE);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  test("clears the plaintext once it is sealed, even if the order request fails", async () => {
    const onApprove = vi.fn().mockRejectedValue(new Error("network down"));
    render(
      <TaxEnabledCheckoutFlow
        order={mockOrder}
        merchantPublicKey={merchantPublicKey}
        onApprove={onApprove}
        mode="full"
      />
    );

    fillValidDeliveryAddress();
    const field = screen.getByLabelText(LABEL);
    fireEvent.change(field, { target: { value: GATE_CODE } });
    fireEvent.click(screen.getByTestId("approve-btn"));

    await waitFor(() => expect(onApprove).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(field).toHaveValue(""));
    expect(screen.queryByTestId("receipt-panel")).not.toBeInTheDocument();
  });

  test("blocks approval and explains why when the note cannot be encrypted", async () => {
    const onApprove = vi.fn();
    render(
      <TaxEnabledCheckoutFlow
        order={mockOrder}
        merchantPublicKey="not-a-valid-key"
        onApprove={onApprove}
        mode="full"
      />
    );

    fillValidDeliveryAddress();
    const field = screen.getByLabelText(LABEL);
    fireEvent.change(field, { target: { value: GATE_CODE } });
    fireEvent.click(screen.getByTestId("approve-btn"));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The merchant's delivery key is not a valid RSA-OAEP public key."
    );
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(field).toHaveValue(GATE_CODE);
    expect(onApprove).not.toHaveBeenCalled();
  });
});
