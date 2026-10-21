"use client";

import { useEffect, useRef, useState } from "react";
import type { CropArea } from "@delegolabs/types";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import {
  BANNER_ASPECT_RATIOS,
  centeredCrop,
  clampCropArea,
  decodeBannerImage,
  renderBannerCrop,
  type BannerAspectRatio,
  type ImageDimensions,
} from "../../lib/bannerCrop";

export interface StorefrontBannerUploaderProps {
  /** The currently saved banner. It is left untouched until `onUpload` succeeds. */
  bannerUrl?: string | null;
  /** Connect this to the existing merchant banner upload request. Receives only the processed crop. */
  onUpload: (file: File) => Promise<void>;
  disabled?: boolean;
}

type SelectedImage = { image: HTMLImageElement; dimensions: ImageDimensions; objectUrl: string };

/**
 * Client-side storefront banner cropper. Crop coordinates are always stored in
 * decoded source pixels, never in CSS/display pixels, so exports stay correct
 * on responsive and high-density screens.
 */
export function StorefrontBannerUploader({ bannerUrl, onUpload, disabled = false }: StorefrontBannerUploaderProps) {
  const [selected, setSelected] = useState<SelectedImage | null>(null);
  const [aspectRatio, setAspectRatio] = useState<BannerAspectRatio>(BANNER_ASPECT_RATIOS.landscape);
  const [crop, setCrop] = useState<CropArea | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [savedPreviewUrl, setSavedPreviewUrl] = useState<string | null>(null);
  const [processedFile, setProcessedFile] = useState<File | null>(null);
  const [processedPreviewUrl, setProcessedPreviewUrl] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const chooseButtonRef = useRef<HTMLButtonElement>(null);
  useFocusTrap({ containerRef: dialogRef, isActive: !!selected, initialFocusRef: chooseButtonRef, onEscape: () => { if (!processing) closeCropper(); } });

  useEffect(() => () => {
    if (selected) URL.revokeObjectURL(selected.objectUrl);
  }, [selected]);
  useEffect(() => () => { if (savedPreviewUrl) URL.revokeObjectURL(savedPreviewUrl); }, [savedPreviewUrl]);
  useEffect(() => () => { if (processedPreviewUrl) URL.revokeObjectURL(processedPreviewUrl); }, [processedPreviewUrl]);

  function closeCropper() {
    setSelected(null);
    setCrop(null);
    setError(null);
    setProcessedFile(null);
    setProcessedPreviewUrl(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function selectFile(file?: File) {
    if (!file || processing) return;
    setError(null);
    setProcessedFile(null);
    setProcessedPreviewUrl(null);
    try {
      const decoded = await decodeBannerImage(file);
      setSelected(decoded);
      setCrop(centeredCrop(decoded.dimensions, aspectRatio));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not read the selected image.");
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function changeAspectRatio(next: BannerAspectRatio) {
    setAspectRatio(next);
    setProcessedFile(null);
    setProcessedPreviewUrl(null);
    if (selected) setCrop(centeredCrop(selected.dimensions, next));
  }

  function updateCrop(next: Partial<CropArea>) {
    if (!selected || !crop) return;
    setProcessedFile(null);
    setProcessedPreviewUrl(null);
    try { setCrop(clampCropArea({ ...crop, ...next }, selected.dimensions)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "The crop area is invalid."); }
  }

  async function applyCrop() {
    if (!selected || !crop || processing) return;
    setProcessing(true);
    setError(null);
    try {
      const file = await renderBannerCrop(selected.image, selected.dimensions, crop);
      const url = URL.createObjectURL(file);
      if (processedPreviewUrl) URL.revokeObjectURL(processedPreviewUrl);
      setProcessedFile(file);
      setProcessedPreviewUrl(url);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save the cropped banner.");
    } finally { setProcessing(false); }
  }

  async function uploadProcessedCrop() {
    if (!processedFile || processing) return;
    setProcessing(true);
    setError(null);
    try {
      await onUpload(processedFile);
      if (processedPreviewUrl) {
        if (savedPreviewUrl) URL.revokeObjectURL(savedPreviewUrl);
        setSavedPreviewUrl(URL.createObjectURL(processedFile));
        setProcessedPreviewUrl(null);
      }
      closeCropper();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not upload the cropped banner.");
    } finally { setProcessing(false); }
  }

  const preview = savedPreviewUrl ?? bannerUrl ?? null;
  const cropWidthPercent = selected && crop ? Math.round((crop.width / selected.dimensions.width) * 100) : 100;
  return (
    <section aria-labelledby="storefront-banner-title" style={{ display: "grid", gap: "0.75rem" }}>
      <div>
        <h2 id="storefront-banner-title" style={{ margin: 0, fontSize: "1rem" }}>Storefront banner</h2>
        <p style={{ margin: "0.25rem 0 0", fontSize: "0.875rem", color: "#4b5563" }}>Upload an image at least 1200 × 400 pixels, then crop it to 16:9 or 3:1.</p>
      </div>
      {preview && <img src={preview} alt="Current storefront banner preview" style={{ width: "100%", maxHeight: 260, objectFit: "cover", borderRadius: "0.5rem", aspectRatio: `${aspectRatio}` }} />}
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={(event) => void selectFile(event.target.files?.[0])} style={{ display: "none" }} aria-label="Select storefront banner image" />
      <button ref={chooseButtonRef} type="button" disabled={disabled || processing} onClick={() => inputRef.current?.click()} style={buttonStyle}>
        {preview ? "Replace banner" : "Select banner image"}
      </button>
      {error && !selected && <div role="alert" aria-live="assertive" style={errorStyle}>{error}</div>}

      {selected && crop && (
        <div role="presentation" style={backdropStyle}>
          <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="banner-cropper-title" style={dialogStyle}>
            <h3 id="banner-cropper-title" style={{ margin: 0 }}>Crop storefront banner</h3>
            <p style={{ margin: 0, color: "#4b5563", fontSize: "0.875rem" }}>Move the crop with the position controls and resize it with zoom. The preview shows the exact output ratio.</p>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              <button type="button" onClick={() => changeAspectRatio(BANNER_ASPECT_RATIOS.landscape)} aria-pressed={aspectRatio === BANNER_ASPECT_RATIOS.landscape} style={buttonStyle}>16:9</button>
              <button type="button" onClick={() => changeAspectRatio(BANNER_ASPECT_RATIOS.panoramic)} aria-pressed={aspectRatio === BANNER_ASPECT_RATIOS.panoramic} style={buttonStyle}>3:1</button>
              <button type="button" onClick={() => inputRef.current?.click()} style={buttonStyle}>Choose another image</button>
            </div>
            <div style={{ position: "relative", overflow: "hidden", background: "#111827", borderRadius: "0.5rem", aspectRatio: `${aspectRatio}` }}>
              {processedPreviewUrl ? (
                <img src={processedPreviewUrl} alt="Processed storefront banner preview" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <img
                  src={selected.objectUrl}
                  alt="Selected banner crop preview"
                  style={{
                    position: "absolute",
                    width: `${(selected.dimensions.width / crop.width) * 100}%`,
                    height: `${(selected.dimensions.height / crop.height) * 100}%`,
                    left: `${-(crop.x / crop.width) * 100}%`,
                    top: `${-(crop.y / crop.height) * 100}%`,
                  }}
                />
              )}
            </div>
            <label style={labelStyle}>Zoom ({cropWidthPercent}% of image width)<input aria-label="Crop zoom" type="range" min="10" max="100" value={cropWidthPercent} onChange={(event) => { const width = selected.dimensions.width * (Number(event.target.value) / 100); updateCrop({ width, height: width / aspectRatio }); }} /></label>
            <label style={labelStyle}>Horizontal position<input aria-label="Crop horizontal position" type="range" min="0" max={Math.max(0, selected.dimensions.width - crop.width)} value={crop.x} onChange={(event) => updateCrop({ x: Number(event.target.value) })} /></label>
            <label style={labelStyle}>Vertical position<input aria-label="Crop vertical position" type="range" min="0" max={Math.max(0, selected.dimensions.height - crop.height)} value={crop.y} onChange={(event) => updateCrop({ y: Number(event.target.value) })} /></label>
            {error && <div role="alert" aria-live="assertive" style={errorStyle}>{error}</div>}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", flexWrap: "wrap" }}>
              <button type="button" onClick={closeCropper} disabled={processing} style={buttonStyle}>Cancel</button>
              {processedFile ? (
                <button type="button" onClick={() => void uploadProcessedCrop()} disabled={processing} style={buttonStyle}>{processing ? "Uploading…" : "Upload cropped banner"}</button>
              ) : (
                <button type="button" onClick={() => void applyCrop()} disabled={processing} style={buttonStyle}>{processing ? "Processing…" : "Preview crop"}</button>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

const buttonStyle = { padding: "0.5rem 0.75rem", borderRadius: "0.5rem", border: "1px solid #9ca3af", background: "#fff", font: "inherit", cursor: "pointer" } as const;
const errorStyle = { color: "#b91c1c", fontSize: "0.875rem" } as const;
const labelStyle = { display: "grid", gap: "0.25rem", fontSize: "0.875rem", fontWeight: 600 } as const;
const backdropStyle = { position: "fixed", inset: 0, zIndex: 1000, display: "grid", placeItems: "center", padding: "1rem", background: "rgba(0,0,0,0.45)" } as const;
const dialogStyle = { width: "min(100%, 720px)", maxHeight: "calc(100vh - 2rem)", overflowY: "auto", display: "grid", gap: "0.875rem", padding: "1.25rem", borderRadius: "0.75rem", background: "#fff" } as const;
