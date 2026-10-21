/**
 * Domain verification for merchant onboarding via SEP-0001 stellar.toml.
 *
 * This module implements the domain ownership verification flow required
 * for merchant registration:
 * 1. Fetches https://<domain>/.well-known/stellar.toml
 * 2. Extracts the SIGNING_KEY from the TOML
 * 3. Verifies it matches the merchant's Stellar address
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface DomainVerificationResult {
  valid: boolean;
  error?: string;
  signingKey?: string;
}

export interface ParsedStellarToml {
  SIGNING_KEY?: string | string[];
  ACCOUNTS?: string[];
  VERSION?: string;
  [key: string]: unknown;
}

export interface SEP0001TOML {
  [key: string]: string | string[];
  SIGNING_KEY?: string | string[];
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const TOML_URL_PATTERN = /.well-known\/stellar\.toml/;

/**
 * Normalizes a domain to include https:// prefix if missing.
 */
function normalizeDomain(domain: string): string {
  const trimmed = domain.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

/**
 * Strips comments from a line, respecting quoted strings.
 */
function stripComment(line: string): string {
  let inDouble = false;
  let inSingle = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"' && !inSingle && (i === 0 || line[i - 1] !== "\\")) {
      inDouble = !inDouble;
    } else if (char === "'" && !inDouble && (i === 0 || line[i - 1] !== "\\")) {
      inSingle = !inSingle;
    } else if (char === "#" && !inDouble && !inSingle) {
      return line.slice(0, i);
    }
  }

  return line;
}

/**
 * Strips surrounding single or double quotes from a string value.
 */
function stripQuotes(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'") && trimmed.length >= 2)
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

/**
 * Parses elements inside a bracketed array string.
 */
function parseArrayElements(content: string): string[] {
  const elements: string[] = [];
  let current = "";
  let inDouble = false;
  let inSingle = false;

  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    if (char === '"' && !inSingle && (i === 0 || content[i - 1] !== "\\")) {
      inDouble = !inDouble;
      current += char;
    } else if (char === "'" && !inDouble && (i === 0 || content[i - 1] !== "\\")) {
      inSingle = !inSingle;
      current += char;
    } else if (char === "," && !inDouble && !inSingle) {
      const cleaned = stripQuotes(current.trim());
      if (cleaned.length > 0) {
        elements.push(cleaned);
      }
      current = "";
    } else {
      current += char;
    }
  }

  const cleaned = stripQuotes(current.trim());
  if (cleaned.length > 0) {
    elements.push(cleaned);
  }

  return elements;
}

/**
 * Parses a simple TOML string into key-value pairs.
 * 
 * This is a minimal TOML parser for the specific subset we need:
 * - Simple key-value pairs: KEY = "value"
 * - Arrays: KEY = ["value1", "value2"]
 * - Comments starting with #
 * - Multi-line bracketed arrays
 */
export function parseTOML(toml: string): ParsedStellarToml {
  const result: ParsedStellarToml = {};
  const lines = toml.split("\n");

  let currentArrayKey: string | null = null;
  let currentArrayBuffer = "";

  for (const rawLine of lines) {
    const withoutComment = stripComment(rawLine).trim();
    if (!withoutComment && currentArrayKey === null) {
      continue;
    }

    if (currentArrayKey !== null) {
      const closeBracketIndex = withoutComment.indexOf("]");
      if (closeBracketIndex !== -1) {
        currentArrayBuffer += " " + withoutComment.slice(0, closeBracketIndex);
        result[currentArrayKey] = parseArrayElements(currentArrayBuffer);
        currentArrayKey = null;
        currentArrayBuffer = "";
      } else {
        currentArrayBuffer += " " + withoutComment;
      }
      continue;
    }

    const equalsIndex = withoutComment.indexOf("=");
    if (equalsIndex === -1) continue;

    const key = withoutComment.slice(0, equalsIndex).trim();
    const value = withoutComment.slice(equalsIndex + 1).trim();

    if (value.startsWith("[")) {
      const closeBracketIndex = value.indexOf("]");
      if (closeBracketIndex !== -1) {
        // Single-line array
        const inner = value.slice(1, closeBracketIndex);
        result[key] = parseArrayElements(inner);
      } else {
        // Multi-line array start
        currentArrayKey = key;
        currentArrayBuffer = value.slice(1);
      }
    } else {
      result[key] = stripQuotes(value);
    }
  }

  return result;
}

/**
 * Validates a Stellar public key (G...) address.
 */
function isValidStellarAddress(address: string): boolean {
  if (!address || address.length !== 56 || !address.startsWith("G")) {
    return false;
  }
  // Simple character validation (should be base32)
  return /^[A-Z2-7]+$/.test(address);
}

/**
 * Fetches the stellar.toml file from a domain.
 */
async function fetchTOML(domain: string): Promise<string | null> {
  try {
    const url = `${normalizeDomain(domain)}/.well-known/stellar.toml`;
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Accept": "text/plain",
        "User-Agent": "Delego-Merchant-Registration/1.0",
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error("stellar.toml not found at the expected location.");
      }
      throw new Error(`HTTP ${response.status}: Could not fetch stellar.toml`);
    }

    return await response.text();
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    throw new Error(`Failed to fetch stellar.toml: ${error.message}`);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Verifies domain ownership via SEP-0001 stellar.toml.
 *
 * Steps:
 * 1. Fetches https://<domain>/.well-known/stellar.toml
 * 2. Parses the TOML and extracts SIGNING_KEY
 * 3. Validates the SIGNING_KEY matches the merchant's Stellar address
 *
 * @param domain - The merchant's domain name
 * @param stellarAddress - The merchant's Stellar public address (G...)
 * @returns DomainVerificationResult with validation status and signing key
 */
export async function verifyDomainOwnership(
  domain: string,
  stellarAddress: string
): Promise<DomainVerificationResult> {
  // Validate inputs
  if (!domain || domain.trim().length === 0) {
    return {
      valid: false,
      error: "Domain name is required.",
    };
  }

  if (!isValidStellarAddress(stellarAddress)) {
    return {
      valid: false,
      error: "Invalid Stellar address format.",
    };
  }

  try {
    // Fetch the stellar.toml file
    const tomlContent = await fetchTOML(domain);

    if (!tomlContent) {
      return {
        valid: false,
        error: "Could not retrieve stellar.toml from the domain.",
      };
    }

    // Parse the TOML content
    const tomlData = parseTOML(tomlContent);

    // Extract SIGNING_KEY
    const signingKey = tomlData.SIGNING_KEY;

    if (!signingKey) {
      return {
        valid: false,
        error: "stellar.toml does not contain a SIGNING_KEY entry.",
      };
    }

    // Handle both single string and array of signing keys
    const signingKeys = Array.isArray(signingKey) ? signingKey : [signingKey];

    // Check if our address matches any of the signing keys
    const addressMatch = signingKeys.some((key) => {
      // Trim and normalize the key (remove quotes if present)
      const normalizedKey = key.trim().replace(/^["']|["']$/g, "");
      return normalizedKey === stellarAddress;
    });

    if (!addressMatch) {
      return {
        valid: false,
        error: `The domain's SIGNING_KEY does not match your Stellar address. Expected: ${stellarAddress}. Found: ${signingKeys.join(", ")}`,
        signingKey: signingKeys.join(", "),
      };
    }

    return {
      valid: true,
      signingKey: signingKeys.join(", "),
    };
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    return {
      valid: false,
      error: error.message,
    };
  }
}

/**
 * Generates a verification message for domain ownership.
 * This can be used for manual verification or fallback scenarios.
 */
export function generateVerificationMessage(
  domain: string,
  timestamp?: Date
): string {
  const ts = timestamp || new Date();
  return `Verify domain ownership for ${domain} on ${ts.toISOString()}`;
}

/**
 * Validates domain format without network access.
 */
export function isValidDomainFormat(domain: string): boolean {
  if (!domain || domain.trim().length === 0) return false;

  const trimmed = domain.trim();

  // Remove protocol if present
  const domainWithoutProtocol = trimmed.replace(/^https?:\/\//, "").replace(/^\/\//, "");

  // Basic domain regex (simplified)
  const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?)*$/;

  return domainRegex.test(domainWithoutProtocol);
}