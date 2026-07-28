import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DelegationQR } from "./DelegationQR";

vi.mock("qrcode", () => ({
  default: {
    toDataURL: vi.fn(async () => "data:image/png;base64,test"),
  },
}));

describe("DelegationQR", () => {
  const mockProps = {
    delegationId: "deleg-123",
    userId: "user-456",
    agentId: "agent-789",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders loading state initially", () => {
    render(<DelegationQR {...mockProps} />);
    expect(screen.getByText(/generating qr code/i)).toBeDefined();
  });

  it("renders QR code after loading", async () => {
    render(<DelegationQR {...mockProps} />);
    await waitFor(() => {
      const img = screen.getByRole("img", { name: /qr code for delegation/i });
      expect(img).toBeDefined();
    });
  });

  it("renders download button", async () => {
    render(<DelegationQR {...mockProps} />);
    await waitFor(() => {
      const downloadBtn = screen.getByRole("button", {
        name: /download qr code/i,
      });
      expect(downloadBtn).toBeDefined();
    });
  });

  it("displays sharing instructions", async () => {
    render(<DelegationQR {...mockProps} />);
    await waitFor(() => {
      expect(screen.getByText(/share this qr code/i)).toBeDefined();
    });
  });

  it("renders error on QR generation failure", async () => {
    const QRCode = await import("qrcode");
    (QRCode.default.toDataURL as any).mockRejectedValueOnce(
      new Error("QR generation failed")
    );

    render(<DelegationQR {...mockProps} />);
    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeDefined();
    });
  });
});
