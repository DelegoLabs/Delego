/**
 * Email notification sender.
 *
 * Uses the template renderer to produce HTML/text bodies before sending.
 * Returns a structured TemplateRenderResult so callers receive a typed error
 * instead of a thrown exception when a template fails to render.
 */

import type { TemplateRenderResult } from "../templates/index.js";
import { renderTemplate } from "../templates/index.js";

export type { TemplateRenderResult };

export interface EmailMessage {
  to: string;
  subject: string;
  /** Pre-rendered HTML body — prefer sendTemplatedEmail() over constructing this manually */
  body: string;
}

/**
 * Send a raw email notification.
 *
 * TODO: Integrate SMTP provider (nodemailer / SES / Postmark).
 */
export async function sendEmail(_message: EmailMessage): Promise<void> {
  throw new Error("Not implemented — TODO: SMTP integration");
}

/**
 * Render a named template with `vars`, then send the resulting email.
 *
 * If the template fails to render (missing variables, template not found,
 * or any render error) the function returns the error result without
 * attempting to send — guaranteeing that no partial email is delivered.
 *
 * On success, returns `{ html, text }` from the render (the send itself is
 * currently a stub; wire `sendEmail` to a real provider and remove the
 * try/catch guard there when ready).
 *
 * @example
 * const result = await sendTemplatedEmail(
 *   "approval-request",
 *   { orderId: "123", amount: "50 XLM", approvalUrl: "https://…" },
 *   { to: "user@example.com", subject: "Action required: approve purchase" }
 * );
 * if (result.error) {
 *   log.error("Email render failed", { error: result.error });
 * }
 */
export async function sendTemplatedEmail(
  templateName: string,
  vars: Record<string, string>,
  meta: Pick<EmailMessage, "to" | "subject">
): Promise<TemplateRenderResult> {
  const rendered = await renderTemplate(templateName, vars);

  if (rendered.error) {
    // Return structured error — do not attempt to send a broken email.
    return rendered;
  }

  // html and text are guaranteed to be present when error is absent.
  const body = rendered.html ?? rendered.text ?? "";

  try {
    await sendEmail({ to: meta.to, subject: meta.subject, body });
  } catch (err) {
    // Sending is still a stub; surface the error as a structured result
    // rather than propagating an untyped exception to callers.
    const message = err instanceof Error ? err.message : String(err);
    return { error: `SEND_ERROR: ${message}` };
  }

  return rendered;
}
