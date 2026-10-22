import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { InventorySettings } from "./InventorySettings";

describe("InventorySettings", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it("renders both threshold field and auto-reorder configuration form", () => {
    render(<InventorySettings />);

    expect(screen.getByTestId("merchant-inventory-settings")).toBeInTheDocument();
    expect(screen.getByText("Catalog Stock Alert Threshold")).toBeInTheDocument();
    expect(screen.getByText("Automated Supplier Reorder Webhook")).toBeInTheDocument();
    expect(screen.getByTestId("supplier-webhook-url-input")).toBeInTheDocument();
    expect(screen.getByTestId("mock-ping-button")).toBeInTheDocument();
  });
});
