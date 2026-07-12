import sgMail from "@sendgrid/mail";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createLogger } from "@delego/utils";
import { classifyError, calculateBackoffDelay } from "./errorClassifier.js";
import { getRetryConfig } from "./config.js";
import { logToDLQ } from "./dlq.js";
import type { EmailDispatchJob } from "./types.js";

const log = createLogger(
  "notifications:email",
  process.env.LOG_LEVEL ?? "info"
);
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

export type { EmailDispatchJob } from "./types.js";

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

/**
 * Sends an email with automatic retry on transient failures.
 * Implements exponential backoff and distinguishes between transient and permanent failures.
 * On permanent failure or max retries exceeded, logs to DLQ before throwing.
 */
export async function sendEmailWithRetry(
  job: EmailDispatchJob,
  subject: string,
  attempt: number = 0
): Promise<void> {
  const config = getRetryConfig();

  try {
    // Convert payload to template data (all values should be strings)
    const templateData = Object.fromEntries(
      Object.entries(job.payload).map(([key, value]) => [
        key,
        String(value),
      ])
    );

    // Attempt to send email
    await sendEmail({
      to: job.recipient,
      subject,
      templateName: job.templateName,
      templateData,
    });

    // Success on any attempt
    log.debug("Email delivered successfully", {
      notificationId: job.notificationId,
      recipient: job.recipient,
      templateName: job.templateName,
      userId: job.userId,
      attempt: attempt + 1,
    });
  } catch (error) {
    const classification = classifyError(error);
    const errorMessage =
      error instanceof Error ? error.message : String(error);

    // Permanent failure - log to DLQ immediately and throw
    if (classification === "permanent") {
      log.info("Permanent failure detected, moving to DLQ", {
        notificationId: job.notificationId,
        recipient: job.recipient,
        templateName: job.templateName,
        userId: job.userId,
        errorReason: errorMessage,
        attempt: attempt + 1,
      });

      const jobForDLQ = { ...job, attempts: attempt + 1 };
      await logToDLQ(jobForDLQ, error as Error);

      // Throw error with standard format
      throw {
        code: "EMAIL_DISPATCH_FAILED",
        message: `Failed to send email after ${attempt + 1} attempt${
          attempt + 1 > 1 ? "s" : ""
        }`,
        lastError: error,
      };
    }

    // Transient failure - retry if attempts remain
    if (attempt < config.maxRetries) {
      const nextAttempt = attempt + 1;
      const backoffDelay = calculateBackoffDelay(
        nextAttempt,
        config.baseDelaySeconds
      );

      log.info("Transient failure detected, retrying", {
        notificationId: job.notificationId,
        recipient: job.recipient,
        templateName: job.templateName,
        userId: job.userId,
        failureReason: errorMessage,
        currentAttempt: attempt + 1,
        nextAttemptIn: `${backoffDelay / 1000}s`,
      });

      log.debug("Retry delay calculated", {
        attempt: nextAttempt,
        baseDelaySeconds: config.baseDelaySeconds,
        delayMs: backoffDelay,
      });

      // Wait for backoff period
      await new Promise((resolve) => setTimeout(resolve, backoffDelay));

      // Recursive retry
      return sendEmailWithRetry(job, subject, nextAttempt);
    }

    // Max retries exceeded - log to DLQ and throw
    log.warn("Max retries exceeded for email dispatch", {
      notificationId: job.notificationId,
      recipient: job.recipient,
      templateName: job.templateName,
      userId: job.userId,
      totalAttempts: attempt + 1,
      maxRetries: config.maxRetries,
      lastError: errorMessage,
    });

    const jobForDLQ = { ...job, attempts: attempt + 1 };
    await logToDLQ(jobForDLQ, error as Error);

    // Throw error with standard format
    throw {
      code: "EMAIL_DISPATCH_FAILED",
      message: `Failed to send email after ${attempt + 1} attempt${
        attempt + 1 > 1 ? "s" : ""
      }`,
      lastError: error,
    };
  }
}

