/**
 * Image metadata stripping utilities for dispute evidence uploads.
 * 
 * Strips EXIF data (GPS coordinates, device info) from images client-side
 * by redrawing them on canvas before upload.
 */

export interface CleanedImageFile {
  file: File;
  previewUrl: string;
  originalName: string;
  sizeBytes: number;
}

/**
 * Strip EXIF metadata from an image file by redrawing it on canvas.
 * 
 * This removes GPS coordinates, camera make/model, timestamps, and other
 * sensitive metadata that could be embedded in the original image.
 * 
 * @param originalFile - The original image file to clean
 * @param quality - JPEG quality (0.0 to 1.0), default 0.92
 * @returns Promise resolving to CleanedImageFile with metadata stripped
 */
export async function stripImageMetadata(
  originalFile: File,
  quality = 0.92
): Promise<CleanedImageFile> {
  return new Promise((resolve, reject) => {
    // Validate file type
    if (!originalFile.type.startsWith("image/")) {
      reject(new Error("File must be an image"));
      return;
    }

    const img = new Image();
    const reader = new FileReader();

    reader.onerror = () => reject(new Error("Failed to read file"));
    
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      if (!dataUrl) {
        reject(new Error("Failed to load image data"));
        return;
      }

      img.onerror = () => reject(new Error("Failed to load image"));
      
      img.onload = () => {
        try {
          // Create canvas with same dimensions as image
          const canvas = document.createElement("canvas");
          canvas.width = img.width;
          canvas.height = img.height;

          const ctx = canvas.getContext("2d");
          if (!ctx) {
            reject(new Error("Failed to get canvas context"));
            return;
          }

          // Draw image to canvas (this strips EXIF data)
          ctx.drawImage(img, 0, 0);

          // Convert canvas to blob
          canvas.toBlob(
            (blob) => {
              if (!blob) {
                reject(new Error("Failed to create blob from canvas"));
                return;
              }

              // Create new file from blob
              const cleanedFile = new File([blob], originalFile.name, {
                type: originalFile.type || "image/jpeg",
                lastModified: Date.now(),
              });

              // Create preview URL
              const previewUrl = URL.createObjectURL(blob);

              resolve({
                file: cleanedFile,
                previewUrl,
                originalName: originalFile.name,
                sizeBytes: blob.size,
              });
            },
            originalFile.type || "image/jpeg",
            quality
          );
        } catch (err) {
          reject(err);
        }
      };

      img.src = dataUrl;
    };

    reader.readAsDataURL(originalFile);
  });
}

/**
 * Batch strip metadata from multiple image files.
 * 
 * @param files - Array of image files to process
 * @param quality - JPEG quality (0.0 to 1.0), default 0.92
 * @returns Promise resolving to array of CleanedImageFile objects
 */
export async function stripMultipleImagesMetadata(
  files: File[],
  quality = 0.92
): Promise<CleanedImageFile[]> {
  return Promise.all(files.map((file) => stripImageMetadata(file, quality)));
}

/**
 * Clean up preview URLs to prevent memory leaks.
 * Call this when images are removed or component unmounts.
 * 
 * @param cleanedFiles - Array of CleanedImageFile objects to clean up
 */
export function revokePreviewUrls(cleanedFiles: CleanedImageFile[]): void {
  cleanedFiles.forEach((cleaned) => {
    URL.revokeObjectURL(cleaned.previewUrl);
  });
}
