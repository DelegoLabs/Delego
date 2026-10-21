import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { classifyContact, RestockNotifyPopover } from "./RestockNotifyPopover";

describe("classifyContact", () => {
  it("detects email and stellar key", () => {
    expect(classifyContact("a@b.co")).toBe("email");
    expect(
      classifyContact("GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF"),
    ).toBe("stellar_memo"); // use a real valid G… key in CI if checksum matters
    expect(classifyContact("nope")).toBeNull();
  });
});

describe("RestockNotifyPopover", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }),
    );
  });

  it("submits waitlist payload", async () => {
    render(<RestockNotifyPopover productId="prod_1" />);
    fireEvent.click(screen.getByTestId("restock-notify-trigger"));
    fireEvent.change(screen.getByTestId("restock-notify-input"), {
      target: { value: "buyer@example.com" },
    });
    fireEvent.click(screen.getByTestId("restock-notify-submit"));
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        "/api/v1/products/prod_1/waitlist",
        expect.objectContaining({ method: "POST" }),
      );
      expect(screen.getByTestId("restock-notify-success")).toBeInTheDocument();
    });
  });
});
