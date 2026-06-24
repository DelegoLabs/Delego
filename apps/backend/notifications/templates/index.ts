/**
 * Template renderer for notification emails.
 *
 * Validates that all required variables are present before rendering,
 * and returns a structured result so callers never send partial emails.
 */

import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface TemplateRenderResult {
  html?: string;
  text?: string;
  error?: string;
}

/**
 * Known templates and their required variable sets.
 * Add entries here whenever a new template is introduced.
 */
const TEMPLATE_REQUIRED_VARS: Record<string, string[]> = {
  "approval-request": ["orderId", "amount", "approvalUrl"],
};

/**
 * Extract all `{{variableName}}` placeholders from a template string.
 */
function extractPlaceholders(template: string): string[] {
  const matches = template.matchAll(/\{\{(\w+)\}\}/g);
  return [...matches].map((m) => m[1]);
}

/**
 * Substitute `{{key}}` placeholders with values from `vars`.
 * Placeholders with no corresponding variable are left untouched so the
 * caller can detect a partially rendered result — though in practice the
 * pre-render validation will catch this first.
 */
function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : match
  );
}

/**
 * Derive a plain-text version from an HTML template by stripping tags and
 * collapsing whitespace.  This is intentionally simple — replace with a
 * proper HTML-to-text library if richer fidelity is needed.
 */
function htmlToText(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Render a named template with the provided variables.
 *
 * Returns `{ html, text }` on success, or `{ error }` on any failure:
 *   - MISSING_VARIABLES — one or more required variables not supplied
 *   - TEMPLATE_NOT_FOUND — the named template file does not exist
 *   - RENDER_ERROR — unexpected failure during rendering
 *
 * @param templateName  Key matching a file in the templates/ directory, e.g. "approval-request"
 * @param vars          Map of variable name → string value
 */
export async function renderTemplate(
  templateName: string,
  vars: Record<string, string>
): Promise<TemplateRenderResult> {
  // 1. Validate required variables against the known set for this template.
  const required = TEMPLATE_REQUIRED_VARS[templateName];
  if (required !== undefined) {
    const missing = required.filter(
      (key) => !Object.prototype.hasOwnProperty.call(vars, key) || vars[key] === ""
    );
    if (missing.length > 0) {
      return {
        error: `MISSING_VARIABLES: ${missing.join(", ")}`,
      };
    }
  }

  // 2. Load the HTML template file.
  const templatePath = join(__dirname, `${templateName}.html`);
  let rawHtml: string;
  try {
    rawHtml = await readFile(templatePath, "utf8");
  } catch {
    return {
      error: `TEMPLATE_NOT_FOUND: ${templateName}`,
    };
  }

  // 3. Validate that no unexpected placeholders remain after the known-variable
  //    check (guards against templates being updated without updating the
  //    required-vars registry).
  const placeholders = extractPlaceholders(rawHtml);
  const undeclaredMissing = placeholders.filter(
    (p) =>
      !Object.prototype.hasOwnProperty.call(vars, p) || vars[p] === ""
  );
  if (undeclaredMissing.length > 0) {
    return {
      error: `MISSING_VARIABLES: ${[...new Set(undeclaredMissing)].join(", ")}`,
    };
  }

  // 4. Render.
  try {
    const html = interpolate(rawHtml, vars);
    const text = htmlToText(html);
    return { html, text };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { error: `RENDER_ERROR: ${message}` };
  }
}
