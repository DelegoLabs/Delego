"use client";

import { useEffect, useRef, useState, type DragEvent } from "react";
import { Button } from "@delegolabs/ui";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import {
  ALLOWED_IMAGE_TYPES,
  PRODUCT_ASSET_CODES,
  decimalToStroops,
  validateImageFile,
  validateProductForm,
  type ProductAssetCode,
  type ProductFormData,
  type ProductFormErrors,
  type ProductSubmitPayload,
} from "../../lib/productForm";

export interface ProductFormModalProps {
  open: boolean;
  /** Present when editing an existing listing; omitted to create a new one. */
  initialData?: Partial<ProductFormData>;
  /** Existing image to preview when editing and no new file has been chosen. */
  initialImageUrl?: string;
  onClose: () => void;
  onSubmit: (payload: ProductSubmitPayload) => Promise<void>;
}

const EMPTY_FORM: ProductFormData = {
  title: "",
  description: "",
  priceDecimal: "",
  assetCode: "USDC",
  stockQuantity: 0,
  category: "",
};

const inputStyle = (hasError: boolean) =>
  ({
    padding: "0.5rem 0.625rem",
    borderRadius: "0.5rem",
    border: `1px solid ${hasError ? "#dc2626" : "#d1d5db"}`,
    font: "inherit",
  }) as const;

const labelStyle = {
  display: "flex",
  flexDirection: "column",
  gap: "0.25rem",
} as const;
const labelTextStyle = { fontSize: "0.8125rem", fontWeight: 600 } as const;
const errorStyle = { color: "#dc2626", fontSize: "0.75rem" } as const;

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <span id={id} style={errorStyle}>
      {message}
    </span>
  );
}

/**
 * Modal for merchants to create or update a product listing (#688), with a
 * drag-and-drop image uploader. The decimal price is converted to stroops on
 * submit.
 */
export function ProductFormModal({
  open,
  initialData,
  initialImageUrl,
  onClose,
  onSubmit,
}: ProductFormModalProps) {
  const [form, setForm] = useState<ProductFormData>({
    ...EMPTY_FORM,
    ...initialData,
  });
  const [stockInput, setStockInput] = useState(
    String(initialData?.stockQuantity ?? 0)
  );
  const [errors, setErrors] = useState<ProductFormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  useFocusTrap({ containerRef: dialogRef, isActive: open });

  const isEdit = initialData !== undefined;

  // Reset whenever the modal is (re)opened so a closed-then-reopened form
  // doesn't carry stale input.
  useEffect(() => {
    if (!open) return;
    setForm({ ...EMPTY_FORM, ...initialData });
    setStockInput(String(initialData?.stockQuantity ?? 0));
    setErrors({});
    setSubmitError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    const file = form.imageFile;
    if (!file || typeof URL.createObjectURL !== "function") {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [form.imageFile]);

  if (!open) return null;

  function update<K extends keyof ProductFormData>(
    key: K,
    value: ProductFormData[K]
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  }

  function acceptFile(file: File | undefined) {
    if (!file) return;
    const imageError = validateImageFile(file);
    if (imageError) {
      setErrors((prev) => ({ ...prev, imageFile: imageError }));
      return;
    }
    update("imageFile", file);
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragActive(false);
    acceptFile(e.dataTransfer.files?.[0]);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const stockQuantity =
      stockInput.trim() === "" ? Number.NaN : Number(stockInput);
    const data: ProductFormData = { ...form, stockQuantity };
    const nextErrors = validateProductForm(data);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    const priceStroops = decimalToStroops(data.priceDecimal);
    if (priceStroops === null) return;

    setSubmitError(null);
    setSubmitting(true);
    try {
      await onSubmit({
        ...data,
        title: data.title.trim(),
        priceDecimal: data.priceDecimal.trim(),
        priceStroops: priceStroops.toString(),
      });
      onClose();
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : "Failed to save product."
      );
    } finally {
      setSubmitting(false);
    }
  }

  const shownImage =
    previewUrl ?? (form.imageFile ? null : (initialImageUrl ?? null));

  return (
    <div
      role="presentation"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: "1rem",
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="product-form-title"
        onKeyDown={(e) => {
          if (e.key === "Escape" && !submitting) onClose();
        }}
        style={{
          background: "#fff",
          borderRadius: "0.75rem",
          padding: "1.25rem",
          width: "100%",
          maxWidth: 520,
          maxHeight: "calc(100vh - 2rem)",
          overflowY: "auto",
        }}
      >
        <form
          noValidate
          onSubmit={(e) => void handleSubmit(e)}
          style={{ display: "flex", flexDirection: "column", gap: "0.875rem" }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <h3 id="product-form-title" style={{ margin: 0 }}>
              {isEdit ? "Edit product" : "Add product"}
            </h3>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              disabled={submitting}
              style={{
                border: "none",
                background: "transparent",
                cursor: "pointer",
              }}
            >
              ✕
            </button>
          </div>

          <label style={labelStyle}>
            <span style={labelTextStyle}>Title</span>
            <input
              type="text"
              value={form.title}
              onChange={(e) => update("title", e.target.value)}
              aria-invalid={!!errors.title}
              aria-describedby={
                errors.title ? "product-title-error" : undefined
              }
              style={inputStyle(!!errors.title)}
            />
            <FieldError id="product-title-error" message={errors.title} />
          </label>

          <label style={labelStyle}>
            <span style={labelTextStyle}>Description</span>
            <textarea
              rows={3}
              value={form.description}
              onChange={(e) => update("description", e.target.value)}
              style={{ ...inputStyle(false), resize: "vertical" }}
            />
          </label>

          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
            <label style={{ ...labelStyle, flex: "2 1 160px" }}>
              <span style={labelTextStyle}>Price</span>
              <input
                type="text"
                inputMode="decimal"
                placeholder="0.00"
                value={form.priceDecimal}
                onChange={(e) => update("priceDecimal", e.target.value)}
                aria-invalid={!!errors.priceDecimal}
                aria-describedby={
                  errors.priceDecimal ? "product-price-error" : undefined
                }
                style={inputStyle(!!errors.priceDecimal)}
              />
              <FieldError
                id="product-price-error"
                message={errors.priceDecimal}
              />
            </label>
            <label style={{ ...labelStyle, flex: "1 1 100px" }}>
              <span style={labelTextStyle}>Asset</span>
              <select
                value={form.assetCode}
                onChange={(e) =>
                  update("assetCode", e.target.value as ProductAssetCode)
                }
                style={inputStyle(false)}
              >
                {PRODUCT_ASSET_CODES.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
            <label style={{ ...labelStyle, flex: "1 1 120px" }}>
              <span style={labelTextStyle}>Stock quantity</span>
              <input
                type="number"
                min={0}
                step={1}
                value={stockInput}
                onChange={(e) => {
                  setStockInput(e.target.value);
                  setErrors((prev) => ({ ...prev, stockQuantity: undefined }));
                }}
                aria-invalid={!!errors.stockQuantity}
                aria-describedby={
                  errors.stockQuantity ? "product-stock-error" : undefined
                }
                style={inputStyle(!!errors.stockQuantity)}
              />
              <FieldError
                id="product-stock-error"
                message={errors.stockQuantity}
              />
            </label>
            <label style={{ ...labelStyle, flex: "2 1 160px" }}>
              <span style={labelTextStyle}>Category</span>
              <input
                type="text"
                value={form.category}
                onChange={(e) => update("category", e.target.value)}
                style={inputStyle(false)}
              />
            </label>
          </div>

          <div style={labelStyle}>
            <span id="product-image-label" style={labelTextStyle}>
              Image
            </span>
            <div
              role="button"
              tabIndex={0}
              aria-labelledby="product-image-label"
              aria-describedby={
                errors.imageFile ? "product-image-error" : "product-image-hint"
              }
              data-testid="product-image-dropzone"
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={handleDrop}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.5rem",
                minHeight: 120,
                padding: "1rem",
                borderRadius: "0.5rem",
                border: `2px dashed ${errors.imageFile ? "#dc2626" : dragActive ? "#2563eb" : "#d1d5db"}`,
                background: dragActive ? "#eff6ff" : "#f9fafb",
                cursor: "pointer",
                textAlign: "center",
              }}
            >
              {shownImage ? (
                // eslint-disable-next-line @next/next/no-img-element -- local blob preview
                <img
                  src={shownImage}
                  alt="Product image preview"
                  style={{
                    maxHeight: 160,
                    maxWidth: "100%",
                    borderRadius: "0.375rem",
                  }}
                />
              ) : null}
              <span style={{ fontSize: "0.8125rem", color: "#374151" }}>
                {form.imageFile
                  ? form.imageFile.name
                  : "Drag an image here, or click to choose one"}
              </span>
              <span
                id="product-image-hint"
                style={{ fontSize: "0.75rem", color: "#6b7280" }}
              >
                JPEG, PNG, WebP or GIF · up to 5 MB
              </span>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept={ALLOWED_IMAGE_TYPES.join(",")}
              data-testid="product-image-input"
              tabIndex={-1}
              aria-hidden="true"
              onChange={(e) => {
                acceptFile(e.target.files?.[0]);
                e.target.value = "";
              }}
              style={{ display: "none" }}
            />
            {form.imageFile && (
              <button
                type="button"
                onClick={() => update("imageFile", undefined)}
                style={{
                  alignSelf: "flex-start",
                  border: "none",
                  background: "transparent",
                  color: "#2563eb",
                  cursor: "pointer",
                  fontSize: "0.75rem",
                  padding: 0,
                }}
              >
                Remove image
              </button>
            )}
            <FieldError id="product-image-error" message={errors.imageFile} />
          </div>

          {submitError && (
            <div
              role="alert"
              style={{ color: "#dc2626", fontSize: "0.8125rem" }}
            >
              {submitError}
            </div>
          )}

          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: "0.5rem",
            }}
          >
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={submitting}>
              {submitting ? "Saving…" : isEdit ? "Save changes" : "Add product"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
