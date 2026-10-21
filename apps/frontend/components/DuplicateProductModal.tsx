"use client";

/**
 * "Duplicate product" flow for the merchant catalog (#1012).
 *
 * Opens the Add-product form pre-filled from an existing listing: the title
 * gets " (Copy)", stock is reset to zero, a collision-free SKU is suggested,
 * and images / the variant matrix are copied only when the merchant opts in.
 * Submitting is blocked while the SKU (or any re-keyed variant SKU) collides
 * with one already in the catalog.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@delegolabs/ui";
import { useFocusTrap } from "../hooks/useFocusTrap";
import type { MerchantProduct } from "../lib/merchantCatalog";
import {
  buildDuplicateDraft,
  duplicateTitle,
  suggestDuplicateSku,
  validateDuplicateDraft,
  validateDuplicateSku,
  type DuplicateProductDraft,
  type DuplicateProductOptions,
} from "../lib/productDuplicate";
import { decimalToStroops, stroopsToDecimal } from "../lib/productForm";
import { catalogProductKey, type CatalogVariantRecord } from "../lib/variantMatrix";

export type { DuplicateProductOptions } from "../lib/productDuplicate";

export interface DuplicateProductModalProps {
  open: boolean;
  source: MerchantProduct | null;
  /** Every SKU already in use (products and variants). */
  existingSkus: string[];
  /** The source's saved variant matrix, if any. */
  sourceVariants?: CatalogVariantRecord | null;
  onClose: () => void;
  onSubmit: (
    draft: DuplicateProductDraft,
    options: DuplicateProductOptions
  ) => Promise<void>;
}

const labelStyle = {
  display: "flex",
  flexDirection: "column",
  gap: "0.25rem",
} as const;
const labelTextStyle = { fontSize: "0.8125rem", fontWeight: 600 } as const;
const errorStyle = { color: "#dc2626", fontSize: "0.75rem" } as const;
const inputStyle = (hasError: boolean) =>
  ({
    padding: "0.5rem 0.625rem",
    borderRadius: "0.5rem",
    border: `1px solid ${hasError ? "#dc2626" : "#d1d5db"}`,
    font: "inherit",
  }) as const;

export function DuplicateProductModal({
  open,
  source,
  existingSkus,
  sourceVariants = null,
  onClose,
  onSubmit,
}: DuplicateProductModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap({ containerRef: dialogRef, isActive: open });

  const [title, setTitle] = useState("");
  const [sku, setSku] = useState("");
  const [price, setPrice] = useState("");
  const [copyImages, setCopyImages] = useState(true);
  const [copyVariants, setCopyVariants] = useState(true);
  const [skuTouched, setSkuTouched] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const hasImage = Boolean(source?.imageUrl);
  const hasVariants = Boolean(sourceVariants?.variants.length);

  // Re-seed the form from the source every time the modal opens.
  useEffect(() => {
    if (!open || !source) return;
    setTitle(duplicateTitle(source.title));
    setSku(suggestDuplicateSku(source.sku, existingSkus));
    setPrice(stroopsToDecimal(source.priceStroops));
    setCopyImages(Boolean(source.imageUrl));
    setCopyVariants(Boolean(sourceVariants?.variants.length));
    setSkuTouched(false);
    setFormError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, source?.id]);

  const skuError = useMemo(
    () => validateDuplicateSku(sku, existingSkus),
    [sku, existingSkus]
  );

  if (!open || !source) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!source) return;
    setSkuTouched(true);
    if (skuError) return;
    if (!title.trim()) {
      setFormError("Title is required.");
      return;
    }
    const priceStroops = decimalToStroops(price);
    if (priceStroops === null || priceStroops <= 0n) {
      setFormError("Enter a price greater than 0 (up to 7 decimal places).");
      return;
    }

    const options: DuplicateProductOptions = {
      sourceProductId: source.id,
      newSku: sku.trim(),
      copyImages: copyImages && hasImage,
      copyVariants: copyVariants && hasVariants,
    };
    const base = buildDuplicateDraft(source, options, sourceVariants);
    const draft: DuplicateProductDraft = {
      ...base,
      title: title.trim(),
      priceStroops: priceStroops.toString(),
      variants: base.variants
        ? { ...base.variants, productKey: catalogProductKey(title) }
        : null,
    };

    const collision = validateDuplicateDraft(draft, existingSkus);
    if (collision) {
      setFormError(collision);
      return;
    }

    setFormError(null);
    setSubmitting(true);
    try {
      await onSubmit(draft, options);
      onClose();
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "Failed to duplicate product."
      );
    } finally {
      setSubmitting(false);
    }
  }

  const showSkuError = skuTouched && skuError;

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
        aria-labelledby="duplicate-product-title"
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
          <div>
            <h3 id="duplicate-product-title" style={{ margin: 0 }}>
              Add product
            </h3>
            <p style={{ margin: "0.25rem 0 0", fontSize: "0.75rem", color: "#6b7280" }}>
              Duplicating {source.title} (SKU {source.sku}). The copy is
              created unlisted with zero stock.
            </p>
          </div>

          <label style={labelStyle}>
            <span style={labelTextStyle}>Title</span>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              style={inputStyle(false)}
            />
          </label>

          <label style={labelStyle}>
            <span style={labelTextStyle}>SKU</span>
            <input
              type="text"
              value={sku}
              onChange={(e) => {
                setSku(e.target.value);
                setSkuTouched(true);
              }}
              aria-invalid={!!showSkuError}
              aria-describedby={showSkuError ? "duplicate-sku-error" : undefined}
              style={inputStyle(!!showSkuError)}
            />
            {showSkuError && (
              <span id="duplicate-sku-error" style={errorStyle}>
                {skuError}
              </span>
            )}
          </label>

          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
            <label style={{ ...labelStyle, flex: "2 1 160px" }}>
              <span style={labelTextStyle}>Price ({source.assetCode})</span>
              <input
                type="text"
                inputMode="decimal"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                style={inputStyle(false)}
              />
            </label>
            <div style={{ ...labelStyle, flex: "1 1 100px" }}>
              <label style={labelStyle}>
                <span style={labelTextStyle}>Stock quantity</span>
                <input
                  type="number"
                  value={0}
                  readOnly
                  aria-describedby="duplicate-stock-hint"
                  style={{ ...inputStyle(false), background: "#f9fafb" }}
                />
              </label>
              <span
                id="duplicate-stock-hint"
                style={{ fontSize: "0.75rem", color: "#6b7280" }}
              >
                Inventory is never copied — restock after creating.
              </span>
            </div>
          </div>

          <fieldset
            style={{
              border: "1px solid #e5e7eb",
              borderRadius: "0.5rem",
              padding: "0.625rem 0.75rem",
              display: "flex",
              flexDirection: "column",
              gap: "0.375rem",
              fontSize: "0.8125rem",
            }}
          >
            <legend style={labelTextStyle}>Copy from original</legend>
            <label style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
              <input
                type="checkbox"
                checked={copyImages && hasImage}
                disabled={!hasImage}
                onChange={(e) => setCopyImages(e.target.checked)}
              />
              Images{!hasImage && " (none on the original)"}
            </label>
            <label style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
              <input
                type="checkbox"
                checked={copyVariants && hasVariants}
                disabled={!hasVariants}
                onChange={(e) => setCopyVariants(e.target.checked)}
              />
              Variants
              {hasVariants
                ? ` (${sourceVariants?.variants.length}, stock reset to 0)`
                : " (none on the original)"}
            </label>
          </fieldset>

          {formError && (
            <div role="alert" style={{ color: "#dc2626", fontSize: "0.8125rem" }}>
              {formError}
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
            <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={submitting}>
              {submitting ? "Creating…" : "Create copy"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default DuplicateProductModal;
