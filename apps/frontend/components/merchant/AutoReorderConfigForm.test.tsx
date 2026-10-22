import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AutoReorderConfigForm } from "./AutoReorderConfigForm";
import {
  AUTO_REORDER_CONFIG_KEY,
  DEFAULT_AUTO_REORDER_CONFIG,
  loadAutoReorderConfig,
  type AutoReorderConfig,
} from "../../lib/autoReorder";

describe("AutoReorderConfigForm", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it("renders with default initial values and all form controls", () => {
    render(<AutoReorderConfigForm />);

    expect(screen.getByText("Automated Supplier Reorder Webhook")).toBeInTheDocument();
    expect(screen.getByTestId("auto-reorder-toggle")).toBeInTheDocument();
    expect(screen.getByTestId("supplier-webhook-url-input")).toBeInTheDocument();
    expect(screen.getByTestId("minimum-threshold-input")).toBeInTheDocument();
    expect(screen.getByTestId("reorder-quantity-input")).toBeInTheDocument();
    expect(screen.getByTestId("mock-ping-button")).toBeInTheDocument();
    expect(screen.getByTestId("save-auto-reorder-button")).toBeInTheDocument();
    expect(screen.getByTestId("auto-reorder-status-badge")).toHaveTextContent("Disabled");
  });

  it("populates initial config when provided as props", () => {
    const customConfig: AutoReorderConfig = {
      supplierWebhookUrl: "https://erp.supplier.com/hooks/restock",
      authHeaderMasked: "Bearer ••••••9999",
      minimumThreshold: 8,
      reorderQuantity: 60,
      isEnabled: true,
    };

    render(<AutoReorderConfigForm initialConfig={customConfig} />);

    expect(screen.getByTestId("supplier-webhook-url-input")).toHaveValue(
      "https://erp.supplier.com/hooks/restock"
    );
    expect(screen.getByTestId("minimum-threshold-input")).toHaveValue(8);
    expect(screen.getByTestId("reorder-quantity-input")).toHaveValue(60);
    expect(screen.getByTestId("auto-reorder-toggle")).toBeChecked();
    expect(screen.getByTestId("auto-reorder-status-badge")).toHaveTextContent("Enabled");
  });

  describe("form validation", () => {
    it("shows error when enabled but supplier webhook URL is empty", async () => {
      const user = userEvent.setup();
      render(<AutoReorderConfigForm />);

      // Enable the toggle
      await user.click(screen.getByTestId("auto-reorder-toggle"));
      expect(screen.getByTestId("auto-reorder-toggle")).toBeChecked();

      // Submit form with empty URL
      await user.click(screen.getByTestId("save-auto-reorder-button"));

      expect(screen.getByTestId("supplier-webhook-url-error")).toBeInTheDocument();
      expect(screen.getByTestId("supplier-webhook-url-error")).toHaveTextContent(
        /Supplier webhook URL is required when auto-reorder is enabled/i
      );
      expect(screen.queryByTestId("auto-reorder-saved-badge")).not.toBeInTheDocument();
    });

    it("shows error when supplier webhook URL is not a valid HTTPS/HTTP URL", async () => {
      const user = userEvent.setup();
      render(<AutoReorderConfigForm />);

      const urlInput = screen.getByTestId("supplier-webhook-url-input");
      await user.clear(urlInput);
      await user.type(urlInput, "not-a-valid-url");

      await user.click(screen.getByTestId("save-auto-reorder-button"));

      expect(screen.getByTestId("supplier-webhook-url-error")).toBeInTheDocument();
      expect(screen.getByTestId("supplier-webhook-url-error")).toHaveTextContent(
        /Webhook URL must be a valid HTTPS URL/i
      );
    });

    it("shows error when minimum threshold is negative", async () => {
      const user = userEvent.setup();
      render(<AutoReorderConfigForm />);

      const thresholdInput = screen.getByTestId("minimum-threshold-input");
      fireEvent.change(thresholdInput, { target: { value: "-5" } });

      await user.click(screen.getByTestId("save-auto-reorder-button"));

      expect(screen.getByTestId("minimum-threshold-error")).toBeInTheDocument();
      expect(screen.getByTestId("minimum-threshold-error")).toHaveTextContent(
        /whole number of 0 or greater/i
      );
    });

    it("shows error when reorder quantity is zero or negative", async () => {
      const user = userEvent.setup();
      render(<AutoReorderConfigForm />);

      const qtyInput = screen.getByTestId("reorder-quantity-input");
      fireEvent.change(qtyInput, { target: { value: "0" } });

      await user.click(screen.getByTestId("save-auto-reorder-button"));

      expect(screen.getByTestId("reorder-quantity-error")).toBeInTheDocument();
      expect(screen.getByTestId("reorder-quantity-error")).toHaveTextContent(
        /at least 1/i
      );
    });
  });

  describe("saving configuration", () => {
    it("validates and saves valid config to localStorage and notifies callback", async () => {
      const user = userEvent.setup();
      const onSave = vi.fn();
      render(<AutoReorderConfigForm onSave={onSave} />);

      // Fill valid URL
      const urlInput = screen.getByTestId("supplier-webhook-url-input");
      await user.clear(urlInput);
      await user.type(urlInput, "https://supplier.example.com/api/restock");

      // Enable toggle
      await user.click(screen.getByTestId("auto-reorder-toggle"));

      // Set threshold
      const thresholdInput = screen.getByTestId("minimum-threshold-input");
      fireEvent.change(thresholdInput, { target: { value: "10" } });

      // Set quantity
      const qtyInput = screen.getByTestId("reorder-quantity-input");
      fireEvent.change(qtyInput, { target: { value: "50" } });

      // Save
      await user.click(screen.getByTestId("save-auto-reorder-button"));

      // Badge should display saved state
      expect(await screen.findByTestId("auto-reorder-saved-badge")).toBeInTheDocument();
      expect(screen.getByTestId("auto-reorder-saved-badge")).toHaveTextContent("Configuration Saved");

      // onSave callback called with new config
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          supplierWebhookUrl: "https://supplier.example.com/api/restock",
          minimumThreshold: 10,
          reorderQuantity: 50,
          isEnabled: true,
        })
      );

      // Verify localStorage was updated
      const savedConfig = loadAutoReorderConfig();
      expect(savedConfig.supplierWebhookUrl).toBe("https://supplier.example.com/api/restock");
      expect(savedConfig.minimumThreshold).toBe(10);
      expect(savedConfig.reorderQuantity).toBe(50);
      expect(savedConfig.isEnabled).toBe(true);
    });
  });

  describe("mock ping connectivity testing", () => {
    it("displays error message if clicking Mock Ping without a webhook URL", async () => {
      const user = userEvent.setup();
      render(<AutoReorderConfigForm />);

      const urlInput = screen.getByTestId("supplier-webhook-url-input");
      await user.clear(urlInput);

      await user.click(screen.getByTestId("mock-ping-button"));

      expect(screen.getByTestId("mock-ping-status")).toBeInTheDocument();
      expect(screen.getByTestId("mock-ping-status")).toHaveTextContent(/Enter a supplier webhook URL/i);
    });

    it("performs mock ping POST and displays success feedback when endpoint responds 200", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
      });
      vi.stubGlobal("fetch", mockFetch);

      const user = userEvent.setup();
      render(<AutoReorderConfigForm />);

      const urlInput = screen.getByTestId("supplier-webhook-url-input");
      await user.clear(urlInput);
      await user.type(urlInput, "https://mock-supplier.internal/api/ping");

      await user.click(screen.getByTestId("mock-ping-button"));

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(1);
      });

      const [calledUrl, options] = mockFetch.mock.calls[0];
      expect(calledUrl).toBe("https://mock-supplier.internal/api/ping");
      expect(options.method).toBe("POST");

      const body = JSON.parse(options.body);
      expect(body.event).toBe("supplier.ping");

      expect(await screen.findByTestId("mock-ping-status")).toBeInTheDocument();
      expect(screen.getByTestId("mock-ping-status")).toHaveTextContent(/Endpoint reachable/i);
    });

    it("displays failure feedback when mock ping returns an HTTP error", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        statusText: "Bad Gateway",
      });
      vi.stubGlobal("fetch", mockFetch);

      const user = userEvent.setup();
      render(<AutoReorderConfigForm />);

      const urlInput = screen.getByTestId("supplier-webhook-url-input");
      await user.clear(urlInput);
      await user.type(urlInput, "https://failing-supplier.internal/ping");

      await user.click(screen.getByTestId("mock-ping-button"));

      expect(await screen.findByTestId("mock-ping-status")).toBeInTheDocument();
      expect(screen.getByTestId("mock-ping-status")).toHaveTextContent(/HTTP 502/i);
    });
  });

  describe("auth header input and masking", () => {
    it("allows entering auth header and masks on blur", async () => {
      const user = userEvent.setup();
      render(<AutoReorderConfigForm />);

      // Click "Set Auth"
      await user.click(screen.getByTestId("auth-header-edit-button"));

      // Enter raw Bearer token
      const authInput = screen.getByTestId("auth-header-input");
      await user.type(authInput, "Bearer secret_supplier_token_1234");
      fireEvent.blur(authInput);

      // Masked input should now show the masked representation
      const maskedInput = screen.getByTestId("auth-header-masked-input");
      expect(maskedInput).toHaveValue("Bearer ••••••1234");
      expect(screen.getByTestId("auth-header-edit-button")).toHaveTextContent("Update");
    });
  });
});
