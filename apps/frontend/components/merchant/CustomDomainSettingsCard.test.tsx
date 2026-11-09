import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CustomDomainSettingsCard } from "./CustomDomainSettingsCard";
import * as customDomainRouting from "../../lib/customDomainRouting";

describe("CustomDomainSettingsCard (#1008)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it("renders target CNAME record with copy button and default inputs", () => {
    render(<CustomDomainSettingsCard />);

    expect(screen.getByTestId("custom-domain-settings-card")).toBeInTheDocument();
    expect(screen.getByText("Custom Storefront Domain & CNAME Routing")).toBeInTheDocument();
    expect(screen.getByTestId("cname-target-display")).toHaveTextContent("cname.delego.market");
    expect(screen.getByTestId("copy-cname-button")).toBeInTheDocument();
    expect(screen.getByTestId("custom-domain-input")).toBeInTheDocument();
    expect(screen.getByTestId("check-dns-button")).toBeInTheDocument();
  });

  it("copies CNAME target to clipboard on button click", async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    render(<CustomDomainSettingsCard />);
    const copyBtn = screen.getByTestId("copy-cname-button");

    fireEvent.click(copyBtn);

    expect(writeTextMock).toHaveBeenCalledWith("cname.delego.market");
    await waitFor(() => {
      expect(copyBtn).toHaveTextContent("Copied!");
    });
  });

  it("displays validation error when checking DNS with empty domain", () => {
    render(<CustomDomainSettingsCard />);
    const checkBtn = screen.getByTestId("check-dns-button");

    fireEvent.click(checkBtn);

    expect(screen.getByTestId("domain-input-error")).toHaveTextContent(
      "Please enter your custom domain (e.g. shop.mybrand.com)."
    );
  });

  it("displays validation error when checking DNS with invalid domain syntax", () => {
    render(<CustomDomainSettingsCard />);
    const input = screen.getByTestId("custom-domain-input");
    const checkBtn = screen.getByTestId("check-dns-button");

    fireEvent.change(input, { target: { value: "invalid_domain" } });
    fireEvent.click(checkBtn);

    expect(screen.getByTestId("domain-input-error")).toHaveTextContent(
      "Please enter a valid domain format without protocols or paths."
    );
  });

  it("renders status badges and diagnostic instructions for unconfigured CNAME", async () => {
    vi.spyOn(customDomainRouting, "validateDomainRouting").mockResolvedValue({
      domain: "shop.mybrand.com",
      cnameTarget: "cname.delego.market",
      isCnameConfigured: false,
      sslStatus: "pending",
      lastCheckedAt: new Date().toISOString(),
    });

    render(<CustomDomainSettingsCard />);
    const input = screen.getByTestId("custom-domain-input");
    const checkBtn = screen.getByTestId("check-dns-button");

    fireEvent.change(input, { target: { value: "shop.mybrand.com" } });
    fireEvent.click(checkBtn);

    await waitFor(() => {
      expect(screen.getByTestId("cname-status-badge")).toHaveTextContent("CNAME Unresolved");
      expect(screen.getByTestId("ssl-status-badge")).toHaveTextContent("SSL Pending");
      expect(screen.getByTestId("dns-diagnostics-panel")).toBeInTheDocument();
      expect(screen.getAllByTestId("diagnostic-instruction-item").length).toBeGreaterThan(0);
    });
  });

  it("renders green status badges and success confirmation when fully configured", async () => {
    vi.spyOn(customDomainRouting, "validateDomainRouting").mockResolvedValue({
      domain: "verified.mybrand.com",
      cnameTarget: "cname.delego.market",
      isCnameConfigured: true,
      sslStatus: "active",
      lastCheckedAt: new Date().toISOString(),
    });

    render(<CustomDomainSettingsCard />);
    const input = screen.getByTestId("custom-domain-input");
    const checkBtn = screen.getByTestId("check-dns-button");

    fireEvent.change(input, { target: { value: "verified.mybrand.com" } });
    fireEvent.click(checkBtn);

    await waitFor(() => {
      expect(screen.getByTestId("cname-status-badge")).toHaveTextContent("CNAME Configured");
      expect(screen.getByTestId("ssl-status-badge")).toHaveTextContent("SSL Active");
      expect(screen.getByTestId("dns-success-confirmation")).toBeInTheDocument();
      expect(screen.queryByTestId("dns-diagnostics-panel")).not.toBeInTheDocument();
    });
  });

  it("reloads stored routing configuration from localStorage on mount", () => {
    window.localStorage.setItem(
      customDomainRouting.CUSTOM_DOMAIN_STORAGE_KEY,
      JSON.stringify({
        domain: "store.stellar.org",
        cnameTarget: "cname.delego.market",
        isCnameConfigured: true,
        sslStatus: "active",
        lastCheckedAt: "2026-11-02T10:00:00.000Z",
      })
    );

    render(<CustomDomainSettingsCard />);

    expect(screen.getByTestId("custom-domain-input")).toHaveValue("store.stellar.org");
    expect(screen.getByTestId("cname-status-badge")).toHaveTextContent("CNAME Configured");
    expect(screen.getByTestId("ssl-status-badge")).toHaveTextContent("SSL Active");
  });
});
