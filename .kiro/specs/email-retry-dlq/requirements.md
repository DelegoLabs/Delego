# Requirements Document

# Email Retry and Dead-Letter Queue Requirements

## Introduction

The Delego notifications system currently sends emails through SendGrid without retry mechanisms or failure tracking. This feature introduces resilient email delivery with configurable retry limits and a persistent Dead-Letter Queue (DLQ) to track and diagnose permanently failed email dispatches. The system will distinguish between transient failures (network issues, temporary service unavailability) and permanent failures (invalid recipients, authentication errors), retrying transient failures up to a configured limit before logging to the DLQ for investigation.

## Glossary

- **EmailDispatcher**: THE component that sends emails and manages the retry workflow
- **EmailDispatchJob**: A single attempt to send an email, containing recipient, template, and payload data
- **FailedNotification**: THE persistent database record of an email dispatch that exceeded maximum retry attempts
- **Dead-Letter Queue (DLQ)**: THE persistent storage mechanism for failed notifications that cannot be retried
- **Transient_Failure**: A temporary failure (network timeout, rate limiting, service temporarily unavailable) that may succeed on retry
- **Permanent_Failure**: An unrecoverable failure (invalid email address, authentication failure, template not found) that should not be retried
- **Retry_Attempt**: A single execution of THE EmailDispatcher to send an email for a given EmailDispatchJob
- **Max_Retry_Limit**: THE configurable maximum number of retry attempts (default: 3) before logging to DLQ
- **Idempotency_Key**: A unique identifier combining userId, channel, eventType, and eventId to prevent duplicate dispatches
- **System**: THE Delego notifications email subsystem

## Requirements

### Requirement 1: Email Retry Mechanism with Configurable Limit

**User Story:** As a developer, I want email dispatch to retry failed attempts automatically, so that transient failures don't result in lost notifications due to temporary service disruptions.

#### Acceptance Criteria

1. THE System SHALL accept a configurable Max_Retry_Limit parameter (environment variable: EMAIL_MAX_RETRIES, default: 3)
2. WHEN an EmailDispatchJob fails with a Transient_Failure, THE System SHALL increment the attempt counter and retry the dispatch
3. WHEN an EmailDispatchJob has exhausted Max_Retry_Limit attempts, THE System SHALL not attempt further retries
4. WHERE a Permanent_Failure is detected on any Retry_Attempt, THE System SHALL immediately log to DLQ without further retries
5. THE System SHALL preserve the original EmailDispatchJob data (recipient, templateName, payload) unchanged across all Retry_Attempts
6. WHEN an EmailDispatchJob is retried, THE System SHALL use exponential backoff with base 2 seconds (delay = 2^(attempt-1) seconds, max 120 seconds) before the next attempt

### Requirement 2: Dead-Letter Queue Persistence

**User Story:** As an operator, I want permanently failed emails recorded in a queryable database table, so that I can investigate failures, replay messages, or diagnose recipient issues.

#### Acceptance Criteria

1. THE System SHALL create a failed_notifications database table with the following columns:
   - id (UUID, primary key, auto-generated)
   - notification_id (UUID, nullable, references original notification request)
   - recipient (TEXT, the intended email recipient address)
   - template_name (TEXT, the template identifier used for rendering)
   - payload (JSONB, complete template data for reconstruction)
   - error_message (TEXT, the last error encountered)
   - attempts (INTEGER, the number of Retry_Attempts made)
   - created_at (TIMESTAMP, recorded when moved to DLQ)
   - updated_at (TIMESTAMP, recorded when status last changed)

2. WHEN an EmailDispatchJob exhausts Max_Retry_Limit attempts, THE System SHALL insert exactly one row into failed_notifications with all required data
3. WHERE the same EmailDispatchJob is retried due to duplicate requests, THE System SHALL not create duplicate DLQ entries if one already exists for the same notification_id and recipient
4. THE failed_notifications table SHALL include an index on (recipient, created_at) to enable operator queries for troubleshooting by recipient or time range
5. THE failed_notifications table SHALL include an index on notification_id for fast lookup of a specific failed notification

### Requirement 3: DLQ Record Completeness for Diagnostics and Replay

**User Story:** As a support engineer, I want DLQ records to contain complete context about a failed email, so that I can understand why it failed and manually replay it if needed.

#### Acceptance Criteria

1. THE failed_notifications record SHALL contain all information necessary to render and re-send the email without accessing external systems
2. THE payload column SHALL store the complete template data as provided to the original dispatch request
3. THE error_message column SHALL capture the exact error from the most recent Retry_Attempt (truncated to 2000 characters if necessary)
4. WHEN a DLQ record is created, THE System SHALL include metadata identifying the failure category (e.g., "invalid_recipient", "service_unavailable", "timeout", "authentication_failed", "other")
5. THE System SHALL provide a utility function to reconstruct the original EmailMessage from a DLQ record for manual inspection or replay

### Requirement 4: Transient vs Permanent Failure Classification

**User Story:** As a system operator, I want the retry mechanism to distinguish between recoverable and unrecoverable failures, so that transient issues don't clog the DLQ with entries that could succeed later.

#### Acceptance Criteria

1. THE System SHALL classify SendGrid API responses and exceptions into Transient_Failure or Permanent_Failure categories:
   - Transient_Failures: HTTP 429 (rate limit), HTTP 5xx (server error), timeout, network error, ECONNREFUSED, ETIMEDOUT
   - Permanent_Failures: HTTP 400 (bad request), HTTP 401 (unauthorized), HTTP 403 (forbidden), HTTP 404 (not found), invalid email format, template not found
2. WHEN a Transient_Failure occurs, THE System SHALL retry the dispatch (if Retry_Attempt count < Max_Retry_Limit)
3. WHEN a Permanent_Failure occurs, THE System SHALL immediately move to DLQ without retrying, regardless of Retry_Attempt count
4. IF the error type cannot be determined, THE System SHALL treat it as Transient_Failure and retry (with maximum caution)

### Requirement 5: Idempotent Email Dispatch

**User Story:** As a developer, I want duplicate email dispatch requests to be safely handled, so that retries, load balancer failover, or message queue resends don't produce duplicate emails.

#### Acceptance Criteria

1. THE System SHALL accept an optional Idempotency_Key when dispatching an email
2. WHEN an email is successfully dispatched with an Idempotency_Key, THE System SHALL record the key and return success on subsequent requests with the same key (without re-sending)
3. WHEN a dispatch request includes an Idempotency_Key and a failure record exists for that key, THE System SHALL return the previous error instead of retrying
4. THE System SHALL preserve existing Idempotency_Key behavior from the dispatcher (via checkAndMarkDispatched in Redis)
5. WHERE Idempotency_Key is not provided, THE System SHALL still track Retry_Attempts but rely on DLQ to prevent duplicate processing

### Requirement 6: EmailDispatchJob Data Structure

**User Story:** As a developer, I want a strongly-typed interface for email dispatch jobs, so that the system enforces required fields and provides IDE autocomplete.

#### Acceptance Criteria

1. THE System SHALL define an EmailDispatchJob interface with the following required properties:
   - notificationId: string (UUID) - unique identifier for the original notification request
   - recipient: string - the destination email address
   - templateName: string - the template identifier to render
   - payload: Record<string, string> - template variables and values
   - attempts: number - current attempt count (0 on initial dispatch)
   - userId: string - the user associated with this notification (for audit and tracing)

2. THE EmailDispatchJob interface SHALL be exported from a types module for use across the notifications package
3. WHEN an EmailDispatchJob is created, THE System SHALL validate that recipient is a valid email format and templateName matches an existing template file
4. THE System SHALL serialize EmailDispatchJob to JSON for storage in the payload column of failed_notifications

### Requirement 7: sendEmailWithRetry Function Implementation

**User Story:** As a developer integrating email dispatch, I want a high-level function that handles retries and DLQ logging automatically, so I don't have to implement retry logic in every call site.

#### Acceptance Criteria

1. THE System SHALL export a sendEmailWithRetry(job: EmailDispatchJob): Promise<void> function
2. WHEN sendEmailWithRetry is called with an EmailDispatchJob, THE System SHALL attempt to send the email
3. IF the dispatch fails with a Transient_Failure, THE System SHALL wait for exponential backoff delay, then recursively call itself with attempts incremented
4. IF the dispatch succeeds, THE System SHALL return without logging to DLQ
5. IF the dispatch exhausts Max_Retry_Limit attempts, THE System SHALL call logToDLQ(job, error) before throwing
6. THE sendEmailWithRetry function SHALL preserve the existing sendEmail error contract (throw on failure) when called for the first attempt (retryCount = 0)
7. WHEN sendEmailWithRetry is called with retryCount > 0 and all retries are exhausted, THE System SHALL throw an error with the format: { code: "EMAIL_DISPATCH_FAILED", message: "Failed to send email after N attempts", lastError: Error }; if the final retry attempt succeeds, THE System SHALL return success

### Requirement 8: logToDLQ Function and Database Integration

**User Story:** As a system maintainer, I want a dedicated function to persist failed notifications to the database, so I can query them for analysis and replay.

#### Acceptance Criteria

1. THE System SHALL export a logToDLQ(job: EmailDispatchJob, error: Error): Promise<void> function
2. WHEN logToDLQ is called, THE System SHALL insert a row into failed_notifications with:
   - notification_id = job.notificationId
   - recipient = job.recipient
   - template_name = job.templateName
   - payload = JSON stringified job.payload
   - error_message = error message (truncated to 2000 characters)
   - attempts = job.attempts
   - created_at = current timestamp
   - updated_at = current timestamp

3. IF a DLQ record already exists for the same (notificationId, recipient) pair from a different dispatch attempt, THE System SHALL create a new DLQ entry (allowing multiple failure records for the same notification if they occur at different times)
4. WHEN logToDLQ encounters a database error (connection failure, constraint violation, timeout), THE System SHALL log the error but not throw (to avoid infinite error loops); non-database errors SHALL propagate as exceptions
5. THE System SHALL create database migrations to define the failed_notifications table on first run

### Requirement 9: Database Connection and Model Integration

**User Story:** As a developer, I want the notifications system to access the same database as the gateway, so that failed notifications are stored in the primary data store.

#### Acceptance Criteria

1. THE System SHALL establish a Sequelize connection to the same PostgreSQL database used by the gateway (via DATABASE_URL or POSTGRES_* environment variables)
2. THE System SHALL define a FailedNotification Sequelize model following the same pattern as gateway models (User, Delegation, etc.)
3. WHEN the notifications service starts, THE System SHALL run database migrations to create the failed_notifications table if it does not exist
4. THE System SHALL reuse the existing db connection pattern from @delego/gateway or establish an independent connection if isolation is required
5. THE FailedNotification model SHALL include timestamps (createdAt, updatedAt) automatically managed by Sequelize

### Requirement 10: Configuration and Environment Variables

**User Story:** As an operator, I want to configure retry behavior and DLQ logging through environment variables, so that I can tune retry strategy per environment without code changes.

#### Acceptance Criteria

1. THE System SHALL read EMAIL_MAX_RETRIES from environment (default: 3, must be an integer between 1 and 10)
2. THE System SHALL read EMAIL_RETRY_BASE_DELAY_SECONDS from environment (default: 2, exponential backoff multiplier in seconds)
3. THE System SHALL read EMAIL_DLQ_ENABLED from environment (default: "true", set to "false" to disable DLQ logging for testing)
4. THE System SHALL validate configuration values on startup and throw an error if invalid (non-integer, out of range), logging the configuration values even when validation fails
5. THE System SHALL log the configured retry and DLQ settings at startup INFO level for audit trail

### Requirement 11: Preserve Existing API Response Format and Error Conventions

**User Story:** As a client of the notifications service, I want the retry mechanism to be transparent and preserve existing error handling contracts, so that my integration code doesn't break.

#### Acceptance Criteria

1. THE System SHALL preserve the existing sendEmail function signature and error behavior for backward compatibility
2. THE sendEmailWithRetry function SHALL return void on success (same contract as sendEmail)
3. WHEN sendEmailWithRetry fails after exhausting retries, THE System SHALL throw an error with the format: { code: "EMAIL_DISPATCH_FAILED", message: "Failed to send email after N attempts", lastError: Error }
4. THE System SHALL not add retry metadata to the existing EmailMessage interface; retry logic is internal to the dispatcher
5. WHEN a caller awaits sendEmailWithRetry and it succeeds, the caller SHALL not be able to distinguish it from sendEmail (idempotent from caller perspective)

### Requirement 12: Logging and Observability

**User Story:** As an operator, I want detailed logs of retry attempts and DLQ events, so that I can monitor email delivery health and debug issues.

#### Acceptance Criteria

1. THE System SHALL log at INFO level each Retry_Attempt, including: notification_id, recipient, attempt_count, failure_reason
2. WHEN an email moves to DLQ, THE System SHALL log at WARN level with: notification_id, recipient, total_attempts, final_error_message
3. THE System SHALL log at DEBUG level the retry delay and backoff calculation for each retry
4. WHEN sendEmailWithRetry completes successfully (on any attempt), THE System SHALL log at DEBUG level: notification_id, recipient, "Email delivered"
5. THE System SHALL include userId in all email-related logs for audit and tracing purposes

### Requirement 13: Idempotency and Duplicate Prevention

**User Story:** As a developer, I want the retry mechanism to work correctly with the existing idempotency system, so that retries don't trigger duplicate dispatches when the same event is processed multiple times.

#### Acceptance Criteria

1. WHEN checkAndMarkDispatched returns false (duplicate detected), THE System SHALL not attempt to send the email or create a DLQ entry
2. WHEN a dispatch is idempotent (same Idempotency_Key as a previous success), THE System SHALL return success without incrementing attempt counters or accessing SendGrid
3. WHEN a dispatch fails and is retried, THE System SHALL preserve the original Idempotency_Key for all retry attempts
4. WHERE the Idempotency_Key indicates a duplicate of a previously failed dispatch, THE System SHALL retrieve the previous DLQ record and return its error context instead of retrying

### Requirement 14: Success Path - No DLQ Writes on Successful Dispatch

**User Story:** As a system operator, I want successful email dispatches to not create any DLQ entries, so that the DLQ remains focused on actual failures.

#### Acceptance Criteria

1. WHEN an email is sent successfully on any attempt (first or retry), THE System SHALL not write to failed_notifications
2. THE System SHALL clear any transient state or flags related to that dispatch after success
3. WHERE an email failed previously but is retried (via separate dispatch request) and succeeds on any attempt, THE System SHALL create a new DLQ record for the old failure (not retroactively remove it)

### Requirement 15: Testing and Coverage Requirements

**User Story:** As a developer, I want comprehensive test coverage of the retry and DLQ mechanisms, so that I can confidently deploy changes without breaking email delivery.

#### Acceptance Criteria

1. THE System SHALL include property-based tests that verify: successful dispatch writes no DLQ row, regardless of payload structure or recipient email format
2. THE System SHALL include property-based tests that verify: failed dispatch after max retries writes exactly one DLQ row with complete context
3. THE System SHALL include property-based tests that verify: retry attempts follow exponential backoff timing (or use mocked time)
4. THE System SHALL include unit tests for the sendEmailWithRetry function covering:
   - Success on first attempt
   - Success on retry attempt (2nd or 3rd)
   - Permanent failure on first attempt (no retry)
   - Transient failure exhausts max retries (writes DLQ)
   - Validation errors (invalid email format, missing template)

5. THE System SHALL include integration tests covering:
   - End-to-end dispatch through SendGrid mock
   - DLQ row creation and query
   - Database persistence across service restart
   - Concurrent dispatch requests don't create duplicate DLQ rows

6. THE System SHALL achieve at least 85% code coverage for retry and DLQ modules; the build SHALL fail if coverage drops below this threshold, even if the configured threshold is higher
