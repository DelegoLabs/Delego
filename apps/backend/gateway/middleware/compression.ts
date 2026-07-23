/**
 * #345 — Request/Response body compression middleware.
 *
 * Compresses responses when:
 *   - The client sends `Accept-Encoding: gzip` or `Accept-Encoding: br`
 *   - The response body is ≥ COMPRESSION_THRESHOLD_BYTES (1 KB)
 *
 * Brotli is preferred over gzip when both are advertised.
 * Small responses pass through unmodified to avoid unnecessary CPU overhead.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { createGzip, createBrotliCompress, constants as zlibConstants } from "node:zlib";

/** Minimum body size (bytes) before compression is applied. */
export const COMPRESSION_THRESHOLD_BYTES = 1024;

type Encoding = "br" | "gzip" | "identity";

/**
 * Parses the Accept-Encoding header and returns the best supported encoding.
 * Prefers brotli > gzip > identity.
 */
export function selectEncoding(req: IncomingMessage): Encoding {
  const accept = req.headers["accept-encoding"];
  if (!accept) return "identity";

  const raw = Array.isArray(accept) ? accept.join(", ") : accept;
  const lower = raw.toLowerCase();

  if (lower.includes("br")) return "br";
  if (lower.includes("gzip")) return "gzip";
  return "identity";
}

/**
 * Wraps ServerResponse.write / end to buffer the body, then either
 * compresses it (if large enough) or flushes it as-is.
 *
 * The wrapper is applied once per response so double-wrapping is safe.
 */
function wrapResponse(res: ServerResponse, encoding: Encoding): void {
  const chunks: Buffer[] = [];

  // Capture original methods before patching
  const _write = res.write.bind(res);
  const _end = res.end.bind(res);

  // Prevent double-wrapping
  if ((res as any).__compressionWrapped) return;
  (res as any).__compressionWrapped = true;

  function flush(finalChunk?: Buffer | string): void {
    if (finalChunk) {
      chunks.push(Buffer.isBuffer(finalChunk) ? finalChunk : Buffer.from(finalChunk));
    }

    const body = Buffer.concat(chunks);

    if (encoding === "identity" || body.length < COMPRESSION_THRESHOLD_BYTES) {
      // Restore originals so the raw write works
      res.write = _write;
      res.end = _end;
      res.end(body);
      return;
    }

    // Compress and stream back
    const compressor = encoding === "br"
      ? createBrotliCompress({ params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 4 } })
      : createGzip({ level: 6 });

    res.setHeader("Content-Encoding", encoding);
    res.removeHeader("Content-Length"); // Length changes after compression

    // Restore originals
    res.write = _write;
    res.end = _end;

    const buffers: Buffer[] = [];
    compressor.on("data", (chunk: Buffer) => buffers.push(chunk));
    compressor.on("end", () => {
      const compressed = Buffer.concat(buffers);
      res.setHeader("Content-Length", compressed.byteLength);
      res.end(compressed);
    });
    compressor.on("error", () => {
      // On compression error, fall back to uncompressed body
      res.removeHeader("Content-Encoding");
      res.end(body);
    });

    compressor.end(body);
  }

  // Buffer writes
  res.write = (chunk: any): boolean => {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    return true;
  };

  // On end, compress + flush
  res.end = (chunk?: any): ServerResponse => {
    flush(chunk);
    return res;
  };
}

/**
 * Express/connect-compatible middleware that transparently compresses responses.
 * Safe to apply globally — health checks and small responses are not affected.
 */
export function compressionMiddleware() {
  return (
    req: IncomingMessage,
    res: ServerResponse,
    next: (err?: unknown) => void,
  ): void => {
    const encoding = selectEncoding(req);

    if (encoding !== "identity") {
      res.setHeader("Vary", "Accept-Encoding");
      wrapResponse(res, encoding);
    }

    next();
  };
}
