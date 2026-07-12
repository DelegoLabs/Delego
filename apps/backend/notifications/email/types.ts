/**
 * Represents a single email dispatch job with retry tracking.
 * Used across all retry attempts to maintain idempotency and allow replay from DLQ.
 */
export interface EmailDispatchJob {
  /** Unique identifier for this notification request (UUID) */
  notificationId: string;

  /** Destination email address */
  recipient: string;

  /** Template identifier to render */
  templateName: string;

  /** Template variables and values (preserved unchanged across retries) */
  payload: Record<string, unknown>;

  /** Current attempt count (0-based: 0 for first attempt, 1 for first retry, etc.) */
  attempts: number;

  /** User associated with this notification (for audit and tracing) */
  userId: string;
}
