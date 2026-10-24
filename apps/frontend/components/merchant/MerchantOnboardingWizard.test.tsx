import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MerchantOnboardingWizard } from "./MerchantOnboardingWizard";

// Mock dependencies
const mocks = vi.hoisted(() => ({
  verifyDomainOwnership: vi.fn(() =>
    Promise.resolve({
      valid: true,
      signingKey: "GCEYUZC5MZNB7JYA6ZZ2JNP2LAD23SDUWG52EZKDYAEEIJ2Y6XVWER74",
    })
  ),
  registerMerchant: vi.fn(() => Promise.resolve({ transactionHash: "tx123" })),
  saveOnboardingState: vi.fn(),
  clearOnboardingState: vi.fn(),
  signMessage: vi.fn(() =>
    Promise.resolve({
      signedMessage: "signed-message",
      signerAddress: "GCEYUZC5MZNB7JYA6ZZ2JNP2LAD23SDUWG52EZKDYAEEIJ2Y6XVWER74",
    })
  ),
  useWallet: vi.fn(() => ({
    address: "GCEYUZC5MZNB7JYA6ZZ2JNP2LAD23SDUWG52EZKDYAEEIJ2Y6XVWER74" as string | null,
    isConnected: true,
    connect: vi.fn(),
    getNetwork: vi.fn(),
  })),
}));
vi.mock("../../hooks/useWallet", () => ({
  useWallet: mocks.useWallet,
}));

vi.mock("../../hooks/useNetwork", () => ({
  useNetwork: vi.fn(() => ({
    network: {
      id: "testnet",
      label: "Testnet",
      networkPassphrase: "Test SDF Network ; September 2015",
      sorobanRpcUrl: "https://soroban-testnet.stellar.org",
    },
  })),
}));

vi.mock("@stellar/freighter-api", () => ({ signMessage: mocks.signMessage }));

vi.mock("../../lib/merchantRegistration", () => ({
  isValidContactEmail: (email: string) => email.includes("@"),
  isValidStoreSlug: (slug: string) => /^[a-z0-9-]+$/.test(slug),
  generateStoreSlug: (name: string) => name.toLowerCase().replace(/\s+/g, "-"),
  validateDomainFormat: (domain: string) => ({
    valid: domain.includes(".") && domain.length > 3,
    error: "Invalid domain",
  }),
  registerMerchant: mocks.registerMerchant,
  loadOnboardingState: vi.fn(() => null),
  saveOnboardingState: mocks.saveOnboardingState,
  clearOnboardingState: mocks.clearOnboardingState,
}));

vi.mock("../../lib/merchantDomainVerification", () => ({
  verifyDomainOwnership: mocks.verifyDomainOwnership,
}));

describe("MerchantOnboardingWizard", () => {
  const mockOnComplete = vi.fn();
  const mockOnCancel = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verifyDomainOwnership.mockResolvedValue({
      valid: true,
      signingKey: "GCEYUZC5MZNB7JYA6ZZ2JNP2LAD23SDUWG52EZKDYAEEIJ2Y6XVWER74",
    });
    mocks.registerMerchant.mockResolvedValue({ transactionHash: "tx123" });
    mocks.signMessage.mockResolvedValue({
      signedMessage: "signed-message",
      signerAddress: "GCEYUZC5MZNB7JYA6ZZ2JNP2LAD23SDUWG52EZKDYAEEIJ2Y6XVWER74",
    });
    mocks.useWallet.mockImplementation(() => ({
      address: "GCEYUZC5MZNB7JYA6ZZ2JNP2LAD23SDUWG52EZKDYAEEIJ2Y6XVWER74",
      isConnected: true,
      connect: vi.fn(),
      getNetwork: vi.fn(),
    }));
  });

  const clickNext = () => fireEvent.click(screen.getAllByRole("button", { name: "Next" })[0]);

  const fillStoreDetails = (contactEmail = "contact@store.com", storeSlug = "my-store") => {
    fireEvent.change(screen.getByLabelText(/store name/i), { target: { value: "My Store" } });
    fireEvent.change(screen.getByLabelText(/description/i), { target: { value: "A store" } });
    fireEvent.change(screen.getByLabelText(/contact email/i), { target: { value: contactEmail } });
    fireEvent.change(screen.getByLabelText(/store slug/i), { target: { value: storeSlug } });
  };

  it("renders the wizard with all steps", () => {
    render(<MerchantOnboardingWizard onComplete={mockOnComplete} onCancel={mockOnCancel} />);
    expect(screen.getByText("Register your store")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Store Details", level: 3 })).toBeInTheDocument();
  });

  it("validates store details form", () => {
    render(<MerchantOnboardingWizard onComplete={mockOnComplete} onCancel={mockOnCancel} />);
    
    fillStoreDetails("contact@store.com", "");
    clickNext();

    expect(screen.getByText("Store slug is required.")).toBeInTheDocument();
  });

  it("validates email format", () => {
    render(<MerchantOnboardingWizard onComplete={mockOnComplete} onCancel={mockOnCancel} />);
    
    // Fill store name
    fillStoreDetails("invalid-email");
    clickNext();
    
    expect(screen.getByText("Enter a valid email address.")).toBeInTheDocument();
  });

  it("generates slug from store name", () => {
    render(<MerchantOnboardingWizard onComplete={mockOnComplete} onCancel={mockOnCancel} />);
    
    fireEvent.change(screen.getByLabelText(/store name/i), { target: { value: "My Awesome Store" } });
    fireEvent.click(screen.getByText("Generate"));
    
    expect(screen.getByDisplayValue("my-awesome-store")).toBeInTheDocument();
  });

  it("validates payout address", () => {
    render(<MerchantOnboardingWizard onComplete={mockOnComplete} onCancel={mockOnCancel} />);
    
    // Fill store details first
    fillStoreDetails();
    clickNext();

    screen.getAllByRole("button", { name: "Next" }).forEach((button) => expect(button).toBeDisabled());
  });

  it("verifies wallet ownership", async () => {
    render(<MerchantOnboardingWizard onComplete={mockOnComplete} onCancel={mockOnCancel} />);
    
    // Fill store details
    fillStoreDetails();
    clickNext();
    fireEvent.change(screen.getByRole("textbox", { name: /stellar payout address/i }), { target: { value: "GCEYUZC5MZNB7JYA6ZZ2JNP2LAD23SDUWG52EZKDYAEEIJ2Y6XVWER74" } });
    clickNext();
    
    // Click verify wallet
    fireEvent.click(screen.getByText("Verify Wallet"));
    
    // Should show wallet verification
    await waitFor(() => {
      expect(screen.getByText(/Wallet verified/i)).toBeInTheDocument();
    });
  });

  it("validates domain verification", async () => {
    render(<MerchantOnboardingWizard onComplete={mockOnComplete} onCancel={mockOnCancel} />);
    
    // Fill all steps up to verification
    fillStoreDetails();
    clickNext();
    fireEvent.change(screen.getByRole("textbox", { name: /stellar payout address/i }), { target: { value: "GCEYUZC5MZNB7JYA6ZZ2JNP2LAD23SDUWG52EZKDYAEEIJ2Y6XVWER74" } });
    
    // Navigate to verification
    clickNext();
    fireEvent.click(screen.getByText("Verify Wallet"));
    
    // Try to verify without domain
    await waitFor(() => expect(screen.getByLabelText(/domain name/i)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Verify Domain" })).toBeDisabled();
  });

  it("handles domain verification with matching key", async () => {
    const mockVerifyDomain = mocks.verifyDomainOwnership;
    render(<MerchantOnboardingWizard onComplete={mockOnComplete} onCancel={mockOnCancel} />);
    fillStoreDetails();
    clickNext();
    fireEvent.change(screen.getByRole("textbox", { name: /stellar payout address/i }), { target: { value: "GCEYUZC5MZNB7JYA6ZZ2JNP2LAD23SDUWG52EZKDYAEEIJ2Y6XVWER74" } });
    clickNext();
    fireEvent.click(screen.getByText("Verify Wallet"));
    await waitFor(() => expect(screen.getByLabelText(/domain name/i)).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/domain name/i), { target: { value: "example.com" } });
    fireEvent.click(screen.getByText("Verify Domain"));
    
    await waitFor(() => {
      expect(mockVerifyDomain).toHaveBeenCalledWith("example.com", "GCEYUZC5MZNB7JYA6ZZ2JNP2LAD23SDUWG52EZKDYAEEIJ2Y6XVWER74");
      expect(screen.getByRole("heading", { name: "Complete", level: 3 })).toBeInTheDocument();
    });
  });

  it("completes wallet and domain verification in order", async () => {
    render(<MerchantOnboardingWizard onComplete={mockOnComplete} onCancel={mockOnCancel} />);
    
    fillStoreDetails();
    clickNext();
    fireEvent.change(screen.getByRole("textbox", { name: /stellar payout address/i }), { target: { value: "GCEYUZC5MZNB7JYA6ZZ2JNP2LAD23SDUWG52EZKDYAEEIJ2Y6XVWER74" } });
    clickNext();
    fireEvent.click(screen.getByText("Verify Wallet"));
    await waitFor(() => expect(screen.getByLabelText(/domain name/i)).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/domain name/i), { target: { value: "example.com" } });
    fireEvent.click(screen.getByText("Verify Domain"));
    
    await waitFor(() => expect(screen.getByRole("heading", { name: "Complete", level: 3 })).toBeInTheDocument());
    
  });

  it("calls onCancel when Cancel is clicked", async () => {
    render(<MerchantOnboardingWizard onComplete={mockOnComplete} onCancel={mockOnCancel} />);
    
    fireEvent.click(await screen.findByText("Cancel"));
    
    expect(mockOnCancel).toHaveBeenCalled();
  });

  it("handles wallet connection flow", async () => {
    mocks.useWallet.mockImplementation(() => ({
      address: null,
      isConnected: false,
      connect: vi.fn(),
      getNetwork: vi.fn(),
    }));
    
    render(<MerchantOnboardingWizard onComplete={mockOnComplete} onCancel={mockOnCancel} />);
    
    // Navigate to contract binding
    fillStoreDetails();
    clickNext();
    fireEvent.change(screen.getByRole("textbox", { name: /stellar payout address/i }), { target: { value: "GTEST" } });
    clickNext();
    
    // Should show "Connect Wallet" button
    expect(screen.getAllByRole("button", { name: "Connect Wallet" })[0]).toBeInTheDocument();
  });

  it("persists form data to localStorage", () => {
    const mockSave = mocks.saveOnboardingState;
    
    render(<MerchantOnboardingWizard onComplete={mockOnComplete} onCancel={mockOnCancel} />);
    
    fillStoreDetails();
    
    // Should save after each change
    expect(mockSave).toHaveBeenCalled();
  });

  it("clears onboarding state when cancelled", async () => {
    const mockClear = mocks.clearOnboardingState;
    
    render(<MerchantOnboardingWizard onComplete={mockOnComplete} onCancel={mockOnCancel} />);
    
    fireEvent.click(await screen.findByText("Cancel"));
    
    expect(mockClear).toHaveBeenCalled();
  });
});