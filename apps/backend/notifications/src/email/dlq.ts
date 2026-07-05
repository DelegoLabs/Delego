import { createLogger } from "@delego/utils";
import { FailedNotification } from "../models/FailedNotification.js";
import type { EmailDispatchJob } from "./types.js";

const log = createLogger("notifications:dlq", process.env.LOG_LEVEL ?? "info");

const MAX_ERROR_MESSAGE_LENGTH = 2000;

/**
 * Logs a failed email dispatch to the Dead-Letter Queue.
 * Inserts a row into failed_notifications table with complete context for investigation and replay.
 * 
 * Database errors are logged but not thrown to prevent infinite error loops.
 * Non-database errors propagate as exceptions.
 */
export async function logToDLQ(
  job: EmailDispatchJob,
  error: Error
): Promise<void> {
  try {
    // Truncate error message to 2000 characters
    const errorMessage = error.message.substring(0, MAX_ERROR_MESSAGE_LENGTH);

    // Check for existing DLQ entry with same (notificationId, recipient) pair
    const existingEntry = await FailedNotification.findOne({
      where: {
        notificationId: job.notificationId,
        recipient: job.recipient,
      },
    });

    if (existingEntry) {
      // Duplicate found - don't create another entry
      log.warn("DLQ entry already exists for this notification/recipient pair", {
        notificationId: job.notificationId,
        recipient: job.recipient,
        templateName: job.templateName,
      });
      return;
    }

    // Create new DLQ entry
    await FailedNotification.create({
      notificationId: job.notificationId,
      recipient: job.recipient,
      templateName: job.templateName,
      payload: job.payload,
      errorMessage,
      attempts: job.attempts,
    });

    log.warn("Email moved to Dead-Letter Queue", {
      notificationId: job.notificationId,
      recipient: job.recipient,
      templateName: job.templateName,
      attempts: job.attempts,
      errorMessageSummary: errorMessage.substring(0, 100),
      userId: job.userId,
    });
  } catch (dbError) {
    // Database errors logged but not thrown
    log.error("Failed to log DLQ entry to database", {
      notificationId: job.notificationId,
      recipient: job.recipient,
      error: dbError instanceof Error ? dbError.message : String(dbError),
    });
    // Do not throw - allow the caller to proceed even if DLQ logging fails
  }
}
