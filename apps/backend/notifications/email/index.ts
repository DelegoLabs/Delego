import sgMail from "@sendgrid/mail";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY ?? "";
const FROM_EMAIL = process.env.FROM_EMAIL ?? "noreply@delego.app";

if (SENDGRID_API_KEY) {
  sgMail.setApiKey(SENDGRID_API_KEY);
}

export interface EmailMessage {
  to: string;
  subject: string;
  templateName: string;
  templateData: Record<string, string>;
}

function renderTemplate(
  templateName: string,
  data: Record<string, string>
): string {
  const templatePath = resolve(
    __dirname,
    "../templates",
    `${templateName}.html`
  );
  let html = readFileSync(templatePath, "utf-8");
  for (const [key, value] of Object.entries(data)) {
    html = html.replaceAll(`{{${key}}}`, value);
  }
  return html;
}

export async function sendEmail(message: EmailMessage): Promise<void> {
  if (!SENDGRID_API_KEY) {
    throw new Error("SENDGRID_API_KEY is not configured");
  }

  const html = renderTemplate(message.templateName, message.templateData);

  await sgMail.send({
    to: message.to,
    from: FROM_EMAIL,
    subject: message.subject,
    html,
  });
}
