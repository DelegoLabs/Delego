/**
 * Subresource Integrity (SRI) configuration and validation utilities (#763).
 *
 * Externally referenced scripts and stylesheets must supply an `integrity` hash
 * (specifically SHA-384 per issue requirements) and `crossorigin="anonymous"`
 * to ensure that tampered or compromised third-party CDN scripts are blocked
 * by the browser before execution.
 */

export interface ExternalScriptConfig {
  src: string;
  integrity: string;
  crossOrigin: "anonymous";
  async?: boolean;
  defer?: boolean;
}

export interface ExternalStyleConfig {
  href: string;
  integrity: string;
  crossOrigin: "anonymous";
  rel: "stylesheet";
}

/**
 * Registry of external CDN dependencies with pinned cryptographic hashes.
 */
export const EXTERNAL_SCRIPTS = {
  turnstile: {
    src: "https://challenges.cloudflare.com/turnstile/v0/api.js",
    integrity: "sha384-hLYQBhIuOGH4Z+z13gHtLxBQQ4FBASOj8MUgbTLtSAA68VW/Q+njZLZ2BDqI+gSL",
    crossOrigin: "anonymous" as const,
    async: true,
  },
} as const;

/**
 * Validates that an SRI hash string matches standard SRI format:
 * `sha(256|384|512)-<base64>`.
 */
export function isValidSriHash(integrity: string): boolean {
  if (typeof integrity !== "string") return false;
  return /^sha(256|384|512)-[A-Za-z0-9+/=]{44,88}$/.test(integrity.trim());
}

/**
 * Computes the SHA-384 hash in standard Subresource Integrity format
 * (`sha384-<base64>`).
 */
export async function computeSha384(content: string | Uint8Array): Promise<string> {
  const encoder = new TextEncoder();
  const data = typeof content === "string" ? encoder.encode(content) : content;

  if (typeof globalThis !== "undefined" && globalThis.crypto?.subtle?.digest) {
    const digestBuffer = await globalThis.crypto.subtle.digest("SHA-384", data);
    const hashArray = Array.from(new Uint8Array(digestBuffer));
    const base64 = btoa(String.fromCharCode(...hashArray));
    return `sha384-${base64}`;
  }

  // Node fallback for environments without Web Crypto subtle
  try {
    const { createHash } = await import("node:crypto");
    const hash = createHash("sha384").update(Buffer.from(data)).digest("base64");
    return `sha384-${hash}`;
  } catch {
    throw new Error("SHA-384 computation requires Web Crypto or Node.js crypto");
  }
}

/**
 * Verifies whether script content matches expected Subresource Integrity hash.
 * If tampered or mismatched, returns false (mimicking browser blocking).
 */
export async function verifySubresourceIntegrity(
  content: string | Uint8Array,
  expectedIntegrity: string
): Promise<boolean> {
  if (!expectedIntegrity || !expectedIntegrity.startsWith("sha384-")) {
    return false;
  }
  const actualHash = await computeSha384(content);
  return actualHash === expectedIntegrity.trim();
}

/**
 * Validates that an external asset descriptor satisfies SRI policy.
 */
export function validateExternalAssetSecurity(asset: {
  src?: string;
  href?: string;
  integrity?: string;
  crossOrigin?: string | null;
}): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const url = asset.src || asset.href;

  if (!url) {
    errors.push("Missing asset URL (src or href)");
    return { valid: false, errors };
  }

  const isExternal = /^https?:\/\//i.test(url) || url.startsWith("//");
  if (isExternal) {
    if (!asset.integrity) {
      errors.push(`External asset "${url}" is missing the 'integrity' attribute.`);
    } else if (!isValidSriHash(asset.integrity)) {
      errors.push(
        `External asset "${url}" has invalid integrity format: "${asset.integrity}". Expected sha384-<base64>.`
      );
    }

    if (!asset.crossOrigin || asset.crossOrigin.toLowerCase() !== "anonymous") {
      errors.push(
        `External asset "${url}" must specify crossorigin="anonymous" (received: "${asset.crossOrigin ?? "undefined"}").`
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
