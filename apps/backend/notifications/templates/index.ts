import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const PLACEHOLDER_RE = /\{\{(\w+)\}\}/g;

// Issue #136
export interface TemplateRenderResult {
  html?: string;
  text?: string;
  error?: string;
}

// Issue #211
export interface PaymentFailedTemplateData {
  userName?: string;
  orderId: string;
  reason: string;
  supportUrl?: string;
}

// Issue #212
export interface EscrowReleasedTemplateData {
  orderId: string;
  amount: string;
  merchantName?: string;
  txHash: string;
}

export function validatePaymentFailedData(data: unknown): PaymentFailedTemplateData {
  if (!data || typeof data !== "object") {
    throw new Error("Template data must be an object");
  }
  const d = data as Record<string, unknown>;
  if (!d.orderId || typeof d.orderId !== "string") {
    throw new Error("orderId is required");
  }
  if (!d.reason || typeof d.reason !== "string") {
    throw new Error("reason is required");
  }
  if (d.userName !== undefined && typeof d.userName !== "string") {
    throw new Error("userName must be a string");
  }
  if (d.supportUrl !== undefined && typeof d.supportUrl !== "string") {
    throw new Error("supportUrl must be a string");
  }
  return {
    orderId: d.orderId,
    reason: d.reason,
    userName: d.userName as string | undefined,
    supportUrl: d.supportUrl as string | undefined,
  };
}

export function validateEscrowReleasedData(data: unknown): EscrowReleasedTemplateData {
  if (!data || typeof data !== "object") {
    throw new Error("Template data must be an object");
  }
  const d = data as Record<string, unknown>;
  if (!d.orderId || typeof d.orderId !== "string") {
    throw new Error("orderId is required");
  }
  if (!d.amount || typeof d.amount !== "string") {
    throw new Error("amount is required");
  }
  if (!d.txHash || typeof d.txHash !== "string") {
    throw new Error("txHash is required");
  }
  if (d.merchantName !== undefined && typeof d.merchantName !== "string") {
    throw new Error("merchantName must be a string");
  }
  return {
    orderId: d.orderId,
    amount: d.amount,
    txHash: d.txHash,
    merchantName: d.merchantName as string | undefined,
  };
}

/** Extract unique `{{placeholder}}` keys from template HTML. */
export function extractPlaceholders(template: string): string[] {
  const keys = new Set<string>();
  for (const match of template.matchAll(PLACEHOLDER_RE)) {
    keys.add(match[1]);
  }
  return [...keys];
}

/**
 * Render template HTML with the provided data.
 * Returns a structured result — never leaves unsubstituted `{{vars}}` in html.
 */
export function renderTemplateContent(
  templateHtml: string,
  data: Record<string, string>
): TemplateRenderResult {
  const required = extractPlaceholders(templateHtml);
  const missing = required.filter((key) => data[key] === undefined);
  if (missing.length > 0) {
    return {
      error: `Missing required template variables: ${missing.join(", ")}`,
    };
  }

  let html = templateHtml;
  for (const [key, value] of Object.entries(data)) {
    html = html.replaceAll(`{{${key}}}`, value);
  }

  // Reset lastIndex — global regex retains state across .test() calls.
  PLACEHOLDER_RE.lastIndex = 0;
  if (PLACEHOLDER_RE.test(html)) {
    return {
      error: "Template render left unsubstituted placeholders",
    };
  }

  return { html };
}

/**
 * Load a named HTML template from disk and render it.
 * Missing files and missing variables both produce `{ error }` (issue #136).
 */
export function renderNamedTemplate(
  templateName: string,
  data: Record<string, string>
): TemplateRenderResult {
  const templatePath = resolve(__dirname, `${templateName}.html`);
  if (!existsSync(templatePath)) {
    return { error: `Template not found: ${templateName}` };
  }
  try {
    const templateHtml = readFileSync(templatePath, "utf-8");
    return renderTemplateContent(templateHtml, data);
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? err.message
          : `Failed to render template: ${templateName}`,
    };
  }
}
