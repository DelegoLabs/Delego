import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { CheckoutQrDropdown } from "./CheckoutQrDropdown";
import * as qrDownloadModule from "@/lib/qrDownload";

vi.mock("@/lib/qrDownload", async () => {
  const actual = await vi.importActual<typeof import("@/lib/qrDownload")>("@/lib/qrDownload");
  return {
    ...actual,
    downloadQrCode: vi.fn(),
  };
});

describe("CheckoutQrDropdown", () => {
  const defaultProps = {
    paymentUri: "web+stellar:pay?destination=GABC",
    orderReference: "REF-12345",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders dropdown button and toggles options", () => {
    render(<CheckoutQrDropdown {...defaultProps} />);

    const button = screen.getByRole("button", { name: /Download QR Code Options/i });
    expect(button).toBeInTheDocument();

    fireEvent.click(button);

    expect(screen.getByRole("menuitem", { name: /Download PNG/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Download SVG/i })).toBeInTheDocument();
  });

  it("triggers SVG download when option clicked", async () => {
    vi.mocked(qrDownloadModule.downloadQrCode).mockResolvedValueOnce();

    render(<CheckoutQrDropdown {...defaultProps} />);

    fireEvent.click(screen.getByRole("button", { name: /Download QR Code Options/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Download SVG/i }));

    await waitFor(() => {
      expect(qrDownloadModule.downloadQrCode).toHaveBeenCalledWith(
        defaultProps.paymentUri,
        {
          format: "svg",
          sizePx: 300,
          fileName: defaultProps.orderReference,
        }
      );
    });
  });
});
