"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@delegolabs/ui";
import { stripImageMetadata, revokePreviewUrls, type CleanedImageFile } from "../../lib/imageMetadata";

export interface ImageUploaderProps {
  /** Maximum number of images allowed */
  maxImages?: number;
  /** Called when cleaned images change */
  onChange?: (images: CleanedImageFile[]) => void;
  /** JPEG quality for cleaned images (0.0 to 1.0) */
  quality?: number;
  /** Custom class name */
  className?: string;
}

/**
 * Image uploader component that strips EXIF metadata client-side.
 * 
 * Displays image thumbnails with remove buttons and ensures uploaded images
 * contain no location or device EXIF tags by redrawing through canvas.
 */
export function ImageUploader({
  maxImages = 5,
  onChange,
  quality = 0.92,
  className = "",
}: ImageUploaderProps) {
  const [cleanedImages, setCleanedImages] = useState<CleanedImageFile[]>([]);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Cleanup preview URLs on unmount
  useEffect(() => {
    return () => {
      revokePreviewUrls(cleanedImages);
    };
  }, [cleanedImages]);

  // Notify parent of changes
  useEffect(() => {
    onChange?.(cleanedImages);
  }, [cleanedImages, onChange]);

  const handleFileSelect = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;

      setError(null);
      setProcessing(true);

      try {
        const fileArray = Array.from(files);
        
        // Check if adding these files would exceed max
        if (cleanedImages.length + fileArray.length > maxImages) {
          setError(`Maximum ${maxImages} images allowed`);
          setProcessing(false);
          return;
        }

        // Strip metadata from all selected files
        const newCleanedImages = await Promise.all(
          fileArray.map((file) => stripImageMetadata(file, quality))
        );

        setCleanedImages((prev) => [...prev, ...newCleanedImages]);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to process images");
        console.error("Image processing error:", err);
      } finally {
        setProcessing(false);
        // Reset file input
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      }
    },
    [cleanedImages.length, maxImages, quality]
  );

  const handleRemoveImage = useCallback((index: number) => {
    setCleanedImages((prev) => {
      const removed = prev[index];
      // Revoke the URL to free memory
      URL.revokeObjectURL(removed.previewUrl);
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  const triggerFileInput = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const canAddMore = cleanedImages.length < maxImages;

  return (
    <div className={`image-uploader ${className}`}>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={(e) => handleFileSelect(e.target.files)}
        style={{ display: "none" }}
        aria-label="Select images to upload"
      />

      {cleanedImages.length > 0 && (
        <div className="image-uploader-grid" role="list">
          {cleanedImages.map((cleaned, index) => (
            <div key={cleaned.previewUrl} className="image-uploader-item" role="listitem">
              <img
                src={cleaned.previewUrl}
                alt={`Preview ${index + 1}: ${cleaned.originalName}`}
                className="image-uploader-thumbnail"
              />
              <div className="image-uploader-item-info">
                <span className="image-uploader-filename" title={cleaned.originalName}>
                  {cleaned.originalName}
                </span>
                <span className="image-uploader-filesize">
                  {(cleaned.sizeBytes / 1024).toFixed(1)} KB
                </span>
              </div>
              <Button
                variant="ghost"
                onClick={() => handleRemoveImage(index)}
                ariaLabel={`Remove ${cleaned.originalName}`}
                className="image-uploader-remove"
              >
                Remove
              </Button>
            </div>
          ))}
        </div>
      )}

      {canAddMore && (
        <Button
          variant="ghost"
          onClick={triggerFileInput}
          disabled={processing}
          className="image-uploader-add-button"
        >
          {processing ? "Processing…" : `+ Add image${cleanedImages.length > 0 ? "s" : ""}`}
        </Button>
      )}

      {error && (
        <div className="image-uploader-error" role="alert">
          {error}
        </div>
      )}

      {cleanedImages.length > 0 && (
        <div className="image-uploader-info" role="status" aria-live="polite">
          <p className="image-uploader-privacy-notice">
            🔒 Location and device metadata automatically removed for privacy
          </p>
          <p className="image-uploader-count">
            {cleanedImages.length} of {maxImages} images
          </p>
        </div>
      )}
    </div>
  );
}
