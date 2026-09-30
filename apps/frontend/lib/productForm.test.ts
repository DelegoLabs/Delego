import { describe, expect, it } from "vitest";
import {
  MAX_IMAGE_BYTES,
  decimalToStroops,
  stroopsToDecimal,
  validateImageFile,
  validateProductForm,
  type ProductFormData,
} from "./productForm";

const base: ProductFormData = {
  title: "Trail shoe",
  description: "",
  priceDecimal: "12.5",
  assetCode: "USDC",
  stockQuantity: 3,
  category: "footwear",
};

function file(type: string, size: number): File {
  const f = new File(["x"], "img", { type });
  Object.defineProperty(f, "size", { value: size });
  return f;
}

describe("decimalToStroops", () => {
  it("converts decimals to stroops without float error", () => {
    expect(decimalToStroops("12.5")).toBe(125_000_000n);
    expect(decimalToStroops("0.1")).toBe(1_000_000n);
    expect(decimalToStroops("0.0000001")).toBe(1n);
    expect(decimalToStroops(" 3 ")).toBe(30_000_000n);
  });

  it("rejects malformed input and excess precision", () => {
    expect(decimalToStroops("")).toBeNull();
    expect(decimalToStroops("-1")).toBeNull();
    expect(decimalToStroops("1e5")).toBeNull();
    expect(decimalToStroops("1.12345678")).toBeNull();
  });

  it("round-trips through stroopsToDecimal", () => {
    expect(stroopsToDecimal(125_000_000n)).toBe("12.5");
    expect(stroopsToDecimal("1")).toBe("0.0000001");
  });
});

describe("validateProductForm", () => {
  it("accepts a valid form", () => {
    expect(validateProductForm(base)).toEqual({});
  });

  it("requires a title, a positive price and non-negative whole stock", () => {
    const errors = validateProductForm({
      ...base,
      title: "  ",
      priceDecimal: "0",
      stockQuantity: -1,
    });
    expect(errors.title).toBeDefined();
    expect(errors.priceDecimal).toMatch(/greater than 0/);
    expect(errors.stockQuantity).toBeDefined();
    expect(
      validateProductForm({ ...base, stockQuantity: 1.5 }).stockQuantity
    ).toBeDefined();
    expect(
      validateProductForm({ ...base, stockQuantity: 0 }).stockQuantity
    ).toBeUndefined();
  });
});

describe("validateImageFile", () => {
  it("enforces mime type and the 5MB cap", () => {
    expect(validateImageFile(file("image/png", 1024))).toBeNull();
    expect(validateImageFile(file("image/png", MAX_IMAGE_BYTES))).toBeNull();
    expect(validateImageFile(file("image/png", MAX_IMAGE_BYTES + 1))).toMatch(
      /5 MB/
    );
    expect(validateImageFile(file("application/pdf", 10))).toMatch(/JPEG/);
  });
});
