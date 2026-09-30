import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ProductFormModal } from "./ProductFormModal";
import { MAX_IMAGE_BYTES } from "../../lib/productForm";

function imageFile(type: string, size: number, name = "shoe.png"): File {
  const f = new File(["x"], name, { type });
  Object.defineProperty(f, "size", { value: size });
  return f;
}

function fill(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

describe("ProductFormModal", () => {
  it("shows validation errors and does not submit invalid input", async () => {
    const onSubmit = vi.fn();
    render(<ProductFormModal open onClose={vi.fn()} onSubmit={onSubmit} />);

    fill("Price", "0");
    fill("Stock quantity", "-2");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Add product" }));
    });

    expect(screen.getByText("Title is required.")).toBeInTheDocument();
    expect(
      screen.getByText("Price must be greater than 0.")
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Stock must be a whole number/)
    ).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("converts the decimal price to stroops on submit", async () => {
    const onSubmit = vi.fn(() => Promise.resolve());
    const onClose = vi.fn();
    render(<ProductFormModal open onClose={onClose} onSubmit={onSubmit} />);

    fill("Title", "Trail shoe");
    fill("Price", "12.5");
    fill("Stock quantity", "4");
    fireEvent.change(screen.getByLabelText("Asset"), {
      target: { value: "XLM" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Add product" }));
    });

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Trail shoe",
        priceDecimal: "12.5",
        priceStroops: "125000000",
        assetCode: "XLM",
        stockQuantity: 4,
      })
    );
    expect(onClose).toHaveBeenCalled();
  });

  it("accepts a dropped image and rejects oversized or non-image files", () => {
    render(<ProductFormModal open onClose={vi.fn()} onSubmit={vi.fn()} />);
    const dropzone = screen.getByTestId("product-image-dropzone");

    fireEvent.drop(dropzone, {
      dataTransfer: { files: [imageFile("image/png", MAX_IMAGE_BYTES + 1)] },
    });
    expect(
      screen.getByText("Image must be 5 MB or smaller.")
    ).toBeInTheDocument();

    fireEvent.drop(dropzone, {
      dataTransfer: { files: [imageFile("text/plain", 10, "notes.txt")] },
    });
    expect(screen.getByText(/must be a JPEG/)).toBeInTheDocument();

    fireEvent.drop(dropzone, {
      dataTransfer: { files: [imageFile("image/png", 1024)] },
    });
    expect(screen.getByText("shoe.png")).toBeInTheDocument();
    expect(screen.queryByText(/must be a JPEG/)).not.toBeInTheDocument();
  });

  it("prefills fields in edit mode", () => {
    render(
      <ProductFormModal
        open
        initialData={{ title: "Old", priceDecimal: "3", stockQuantity: 7 }}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />
    );
    expect(
      screen.getByRole("heading", { name: "Edit product" })
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Title")).toHaveValue("Old");
    expect(screen.getByLabelText("Stock quantity")).toHaveValue(7);
  });
});
