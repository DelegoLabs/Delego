import type { QrDownloadOptions } from "@delegolabs/types";

export function formatSafeFilename(orderRef: string, format: "png" | "svg"): string {
  const sanitized = orderRef
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
  const baseName = sanitized || "checkout_qr";
  return `${baseName}.${format}`;
}

export async function generateQrSvgString(
  sep0007Uri: string,
  sizePx: number = 300
): Promise<string> {
  if (!sep0007Uri) {
    throw new Error("SEP-0007 URI is required to generate QR code.");
  }
  const QRCodeModule = await import("qrcode");
  const QRCode = QRCodeModule.default || QRCodeModule;
  const svgString = await QRCode.toString(sep0007Uri, {
    type: "svg",
    width: sizePx,
    margin: 2,
    color: {
      dark: "#000000",
      light: "#ffffff",
    },
  });
  return svgString;
}

export async function generateQrPngBlob(
  sep0007Uri: string,
  sizePx: number = 300
): Promise<Blob> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    throw new Error("PNG QR Blob generation requires browser canvas APIs.");
  }

  const svgString = await generateQrSvgString(sep0007Uri, sizePx);
  const svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = sizePx;
        canvas.height = sizePx;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          URL.revokeObjectURL(url);
          reject(new Error("Failed to get 2D canvas context for QR rendering."));
          return;
        }

        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(img, 0, 0, sizePx, sizePx);
        URL.revokeObjectURL(url);

        canvas.toBlob((blob) => {
          if (!blob) {
            reject(new Error("Canvas toBlob failed to produce a valid PNG blob."));
            return;
          }
          resolve(blob);
        }, "image/png");
      } catch (err) {
        URL.revokeObjectURL(url);
        reject(err);
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load SVG image into canvas for PNG conversion."));
    };

    img.src = url;
  });
}

export async function downloadQrCode(
  sep0007Uri: string,
  options: QrDownloadOptions
): Promise<void> {
  const { format, sizePx, fileName } = options;
  if (!sizePx || sizePx <= 0) {
    throw new Error("Invalid output size for QR code download.");
  }

  const finalFileName = formatSafeFilename(fileName, format);

  if (format === "svg") {
    const svgString = await generateQrSvgString(sep0007Uri, sizePx);
    const blob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
    const downloadUrl = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = finalFileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(downloadUrl);
  } else {
    const pngBlob = await generateQrPngBlob(sep0007Uri, sizePx);
    const downloadUrl = URL.createObjectURL(pngBlob);

    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = finalFileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(downloadUrl);
  }
}
