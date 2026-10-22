import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DuplicateProductModal } from "../DuplicateProductModal";
import type { MerchantProduct } from "../../lib/merchantCatalog";

const SOURCE: MerchantProduct = {
  id: "prod-1",
  sku: "MUG",
  title: "Ceramic Mug",
  priceStroops: "125000000",
  assetCode: "XLM",
  stockQuantity: 12,
  isListed: true,
  updatedAt: "2026-10-01T00:00:00Z",
  imageUrl: "https://cdn.example.com/mug.png",
};

function renderModal(existingSkus = ["MUG"]) {
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  const onClose = vi.fn();
  render(
    <DuplicateProductModal
      open
      source={SOURCE}
      existingSkus={existingSkus}
      onClose={onClose}
      onSubmit={onSubmit}
    />
  );
  return { onSubmit, onClose };
}

describe("DuplicateProductModal", () => {
  it("pre-populates the Add product form from the source", () => {
    renderModal();
    expect(screen.getByRole("heading", { name: "Add product" })).toBeInTheDocument();
    expect(screen.getByLabelText("Title")).toHaveValue("Ceramic Mug (Copy)");
    expect(screen.getByLabelText("SKU")).toHaveValue("MUG-COPY");
    expect(screen.getByLabelText("Price (XLM)")).toHaveValue("12.5");
    expect(screen.getByLabelText("Stock quantity")).toHaveValue(0);
    expect(screen.getByLabelText(/Images/)).toBeChecked();
    expect(screen.getByLabelText(/Variants/)).toBeDisabled();
  });

  it("blocks submission on a SKU collision", async () => {
    const { onSubmit } = renderModal(["MUG", "MUG-2"]);
    fireEvent.change(screen.getByLabelText("SKU"), { target: { value: "mug-2" } });
    expect(screen.getByText(/already used by another product/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Create copy" }));
    await waitFor(() => expect(onSubmit).not.toHaveBeenCalled());
  });

  it("submits a zero-stock unlisted clone with the chosen options", async () => {
    const { onSubmit, onClose } = renderModal();
    fireEvent.click(screen.getByLabelText(/Images/));
    fireEvent.click(screen.getByRole("button", { name: "Create copy" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const [draft, options] = onSubmit.mock.calls[0]!;
    expect(options).toEqual({
      sourceProductId: "prod-1",
      newSku: "MUG-COPY",
      copyImages: false,
      copyVariants: false,
    });
    expect(draft).toMatchObject({
      sku: "MUG-COPY",
      title: "Ceramic Mug (Copy)",
      priceStroops: "125000000",
      stockQuantity: 0,
      isListed: false,
    });
    expect(draft.imageUrl).toBeUndefined();
    expect(onClose).toHaveBeenCalled();
  });
});
