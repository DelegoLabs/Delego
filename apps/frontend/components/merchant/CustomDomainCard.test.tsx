import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CustomDomainCard } from "./CustomDomainCard";
import {
  CNAME_TARGET,
  type DomainRoutingStatus,
} from "../../lib/domainRouting";

const configuredStatus: DomainRoutingStatus = {
  domain: "shop.mybrand.com",
  cnameTarget: CNAME_TARGET,
  isCnameConfigured: true,
  sslStatus: "active",
  lastCheckedAt: "2026-10-23T12:00:00.000Z",
};

const misconfiguredStatus: DomainRoutingStatus = {
  domain: "shop.mybrand.com",
  cnameTarget: CNAME_TARGET,
  isCnameConfigured: false,
  sslStatus: "error",
  lastCheckedAt: "2026-10-23T12:00:00.000Z",
};

describe("CustomDomainCard", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("shows the target CNAME record and copies it", async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(window.navigator.clipboard, "writeText");
    render(<CustomDomainCard />);

    expect(screen.getByTestId("cname-target")).toHaveTextContent(CNAME_TARGET);

    await user.click(screen.getByTestId("copy-cname-button"));

    expect(writeText).toHaveBeenCalledWith(CNAME_TARGET);
    expect(screen.getByTestId("copy-cname-button")).toHaveTextContent("Copied");
  });

  it("shows green CNAME and SSL status indicators after a successful check", async () => {
    const user = userEvent.setup();
    const checkDomain = vi.fn().mockResolvedValue(configuredStatus);
    render(<CustomDomainCard initialDomain="shop.mybrand.com" checkDomain={checkDomain} />);

    await user.click(screen.getByTestId("check-dns-button"));

    expect(checkDomain).toHaveBeenCalledWith("shop.mybrand.com");
    expect(await screen.findByTestId("cname-status-badge")).toHaveTextContent(
      "Configured"
    );
    expect(screen.getByTestId("ssl-status-badge")).toHaveTextContent("Active");
    expect(screen.queryByTestId("dns-diagnostics")).not.toBeInTheDocument();
  });

  it("shows red status indicators and diagnostics for a misconfigured CNAME", async () => {
    const user = userEvent.setup();
    const checkDomain = vi.fn().mockResolvedValue(misconfiguredStatus);
    render(<CustomDomainCard initialDomain="shop.mybrand.com" checkDomain={checkDomain} />);

    await user.click(screen.getByTestId("check-dns-button"));

    expect(await screen.findByTestId("cname-status-badge")).toHaveTextContent(
      "Not configured"
    );
    expect(screen.getByTestId("ssl-status-badge")).toHaveTextContent("Error");

    const diagnostics = screen.getByTestId("dns-diagnostics");
    expect(diagnostics).toHaveTextContent("DNS is not pointing at Delego yet");
    expect(within(diagnostics).getByText("shop.mybrand.com")).toBeInTheDocument();
    expect(within(diagnostics).getByText(CNAME_TARGET)).toBeInTheDocument();
    expect(diagnostics).toHaveTextContent("Check DNS Records");
  });

  it("warns about a validity error and does not run a check for an invalid domain", async () => {
    const user = userEvent.setup();
    const checkDomain = vi.fn().mockResolvedValue(configuredStatus);
    render(<CustomDomainCard checkDomain={checkDomain} />);

    await user.type(screen.getByTestId("custom-domain-input"), "not a domain");
    await user.click(screen.getByTestId("check-dns-button"));

    expect(screen.getByTestId("domain-check-error")).toHaveTextContent(
      "Enter a valid domain name"
    );
    expect(checkDomain).not.toHaveBeenCalled();
  });

  it("shows the DNS lookup error returned by the checker", async () => {
    const user = userEvent.setup();
    const checkDomain = vi.fn().mockRejectedValue(new Error("DNS lookup failed (503)."));
    render(<CustomDomainCard initialDomain="shop.mybrand.com" checkDomain={checkDomain} />);

    await user.click(screen.getByTestId("check-dns-button"));

    expect(await screen.findByTestId("domain-check-error")).toHaveTextContent(
      "DNS lookup failed (503)."
    );
  });
});
