# Design Document

# Email Retry and Dead-Letter Queue Implementation

## Overview

This design implements resilient email delivery with configurable retry limits and persistent Dead-Letter Queue (DLQ) persistence. The system will distinguish between transient failures (network issues, rate limiting) and permanent failures (invalid recipients), retrying transient failures up to a configured limit before logging to the DLQ for investigation.

## Architecture

### High-Level Flow

```
EmailDispatchJob
    ↓
sendEmailWithRetry()
    ├─ Attempt send via SendGrid
    ├─ On success: Return
    ├─ On transient failure (attempt < max):
    │   └─ Wait (exponential backoff) → Retry
    ├─ On permanent failure:
    │   └─ Log to DLQ immediately (no retry)
    └─ On max attempts exceeded:
        └─ Log to DLQ, throw error
```

### Component Breakdown

#### 1. Email Dispatcher Enhancement (`apps/backend/notifications/email/index.ts`)

**New Types:**
```typescript
export interface EmailDispatchJob {
  notificationId: string;
  recipient: string;
  templateName: string;
  payload: Record<string, unknown>;
  attempts: number;
  userId: string;
}
```

**New Functions:**
- `sendEmailWithRetry(job: EmailDispatchJob, attempt?: number): Promise<void>`
- `logToDLQ(job: EmailDispatchJob, error: Error): Promise<void>`
- `classifyError(error: Error): 'transient' | 'permanent'`

**Existing Function Updates:**
- `sendEmail()` - Keep unchanged for backward compatibility
- Refactor internal logic to support retry classification

#### 2. Database Layer

**FailedNotification Model:**
```typescript
export class FailedNotification extends Model {
  public id!: string;
  public notificationId!: string;
  public recipient!: string;
  public templateName!: string;
  public payload!: Record<string, unknown>;
  public errorMessage!: string;
  public attempts!: number;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}
```

**Database Migration:**
- Create `failed_notifications` table
- Add indices on (recipient, created_at) and notification_id
- Use JSONB for payload column

#### 3. Configuration Management

**Environment Variables:**
- `EMAIL_MAX_RETRIES` (default: 3, range: 1-10)
- `EMAIL_RETRY_BASE_DELAY_SECONDS` (default: 2)
- `EMAIL_DLQ_ENABLED` (default: "true")
- `DATABASE_URL` - PostgreSQL connection (shared with gateway or separate)

**Configuration Validation:**
- Validate on startup, throw error if invalid
- Log configuration at INFO level on startup

#### 4. Error Classification

**Transient Failures (retry):**
- HTTP 429 (rate limit)
- HTTP 5xx (server errors)
- Network timeouts (ETIMEDOUT, ECONNREFUSED)
- Socket/connection errors
- EMFILE (too many open files)
- Unknown/unclassified errors

**Permanent Failures (no retry):**
- HTTP 400 (bad request)
- HTTP 401 (unauthorized)
- HTTP 403 (forbidden)
- HTTP 404 (not found)
- Invalid email format errors
- Template not found errors
- Authentication/credential errors

#### 5. Retry Strategy

**Exponential Backoff:**
- Formula: `delay = 2^(attempt-1) * baseDelay`, max 120 seconds
- Attempt 1: immediate
- Attempt 2: ~2 seconds
- Attempt 3: ~4 seconds
- Attempts after 3: capped at 120 seconds

**Idempotency Integration:**
- Preserve existing `checkAndMarkDispatched()` behavior
- Use Redis idempotency key for deduplication
- Track retry attempts separately from idempotency

#### 6. Logging and Observability

**Log Levels:**
- INFO: Each retry attempt with context (notification_id, recipient, attempt count)
- INFO: Successful dispatch after any attempt
- WARN: Email moved to DLQ with failure details
- DEBUG: Retry delay calculation and backoff details
- DEBUG: Successful immediate dispatch (attempt 1)

**Log Fields:**
- notificationId, recipient, templateName, userId
- attemptCount, totalAttempts
- errorMessage, errorCode (for permanent failures)
- retryDelay (for retry attempts)

#### 7. Data Integrity and Idempotency

**DLQ Prevention:**
- Check for existing DLQ record by (notificationId, recipient) pair
- Create new entry only if no record exists for this combination
- Use database UNIQUE constraint or application-level deduplication

**Retry Idempotency:**
- Same EmailDispatchJob object used across retries
- Preserve all fields (payload, templateName) unchanged
- Increment only the attempt counter

**Successful Dispatch After Previous Failure:**
- If a new dispatch request succeeds, do NOT retroactively delete old DLQ entry
- Old DLQ entry remains for audit trail
- New success is logged separately

## Implementation Plan

### Phase 1: Database and Models
1. Create `FailedNotification` Sequelize model
2. Create migration for `failed_notifications` table
3. Set up database connection in notifications service

### Phase 2: Core Email Retry Logic
1. Implement error classification function
2. Implement `sendEmailWithRetry()` with exponential backoff
3. Implement `logToDLQ()` function
4. Add configuration loading and validation

### Phase 3: Integration and Observability
1. Update dispatcher to use `sendEmailWithRetry()`
2. Add comprehensive logging
3. Handle error cases (database failures, etc.)

### Phase 4: Testing
1. Unit tests for retry mechanism
2. Unit tests for error classification
3. Integration tests for DLQ persistence
4. Property-based tests for retry behavior
5. Coverage reporting

## Data Flow

### Successful Dispatch (First Attempt)
```
EmailDispatchJob → sendEmailWithRetry()
  → sendEmail() via SendGrid
  → Success
  → log.debug("Email delivered")
  → Return success
```

### Transient Failure with Retry
```
EmailDispatchJob → sendEmailWithRetry(job, attempt=1)
  → sendEmail() via SendGrid
  → Network timeout (transient)
  → classifyError() → "transient"
  → log.info("Retry attempt 2 in ~2s")
  → Wait 2 seconds
  → sendEmailWithRetry(job, attempt=2)
    → sendEmail() via SendGrid
    → Success
    → log.debug("Email delivered on attempt 2")
    → Return success
```

### Permanent Failure (Immediate DLQ)
```
EmailDispatchJob → sendEmailWithRetry(job, attempt=1)
  → sendEmail() via SendGrid
  → HTTP 400 - Invalid email (permanent)
  → classifyError() → "permanent"
  → logToDLQ(job, error)
  → Insert row into failed_notifications
  → log.warn("Email moved to DLQ: invalid recipient")
  → Throw error
```

### Max Retries Exceeded
```
EmailDispatchJob → sendEmailWithRetry(job, attempt=1)
  → sendEmail() via SendGrid
  → Network timeout (attempt 1)
  → Retry...
  → sendEmailWithRetry(job, attempt=2)
    → sendEmail() via SendGrid
    → Network timeout (attempt 2)
    → Retry...
    → sendEmailWithRetry(job, attempt=3)
      → sendEmail() via SendGrid
      → Network timeout (attempt 3, now at max)
      → classifyError() → "transient"
      → Attempt >= MAX_RETRIES
      → logToDLQ(job, error)
      → Insert row into failed_notifications
      → log.warn("Email moved to DLQ after 3 attempts")
      → Throw error
```

## Integration Points

### Dispatcher Update
The `dispatchTransactionApproval()` function currently catches email errors silently. After implementation:
- Replace `sendEmail()` call with `sendEmailWithRetry()`
- Job data must be constructed from notification fields
- Error handling remains same (catch and log)

### Types and Interfaces
- Export `EmailDispatchJob` from email module
- Keep `EmailMessage` interface for backward compatibility
- Add `FailedNotificationModel` to notifications models

### Database Connection
- Notifications service connects to same PostgreSQL as gateway
- Reuse `DATABASE_URL` environment variable
- Initialize Sequelize connection on service startup

## Error Handling

### SendGrid API Errors
- Parse HTTP status code and error message
- Classify as transient or permanent
- Preserve original error for DLQ logging

### Database Errors
- Catch database connection failures
- Log error but do NOT throw (prevent infinite loops)
- Allow email retry to succeed if SendGrid succeeded (resilience)
- Non-database errors propagate as exceptions

### Configuration Errors
- Validate environment variables on startup
- Log invalid configuration
- Throw error and fail service startup
- Prevent silent misconfiguration

## Security and Compliance

### Data Protection
- Payload stored in JSONB (plaintext, no encryption at rest assumed)
- Error messages truncated to 2000 characters
- No PII filtering (payload contains template variables, which may include names/addresses)
- Access controlled at application level (queryable only by service)

### Idempotency
- Redis-backed idempotency keys prevent duplicate sends
- Combine userId + channel + eventType + eventId
- 24-hour TTL on idempotency keys (existing behavior)

### Audit Trail
- DLQ rows include timestamp (created_at, updated_at)
- Error messages preserved for investigation
- All retry attempts logged with timestamp
- userId included in logs for tracing

## Testing Strategy

### Unit Tests
1. Error classification for all HTTP status codes
2. Exponential backoff calculation
3. Retry counter increment logic
4. DLQ row creation with complete fields
5. Configuration validation

### Integration Tests
1. End-to-end dispatch with mocked SendGrid
2. Successful dispatch (no DLQ row created)
3. Transient failure retry behavior
4. Permanent failure immediate DLQ logging
5. Max retries exceeded → DLQ row created
6. Database persistence across service restarts
7. Concurrent dispatch requests don't create duplicate DLQ rows
8. Idempotency key behavior preserved

### Property-Based Tests
1. Successful dispatch never creates DLQ row (any payload, recipient)
2. Failed dispatch after max retries always creates exactly one DLQ row
3. Retry attempts follow exponential backoff formula

### Coverage
- Minimum 85% code coverage for retry and DLQ modules
- Build fails if coverage drops below threshold
- Coverage report generated on each test run

## Rollout and Migration

### Database Migration
- Sequelize migration creates `failed_notifications` table
- Runs automatically on service startup (or manual `npm run migrate`)
- Idempotent (safe to run multiple times)

### Backward Compatibility
- Existing `sendEmail()` function unchanged
- Dispatcher can incrementally migrate to `sendEmailWithRetry()`
- No breaking changes to EmailMessage interface
- Error contract preserved (throw on failure)

### Deployment
1. Deploy new code with retry/DLQ logic
2. Run database migration
3. Update environment variables (optional, defaults provided)
4. Restart notifications service
5. Monitor logs for retry behavior
6. Query `failed_notifications` table to verify DLQ functionality

## Monitoring and Alerting

### Key Metrics
- Email dispatch success rate (by attempt)
- DLQ row creation rate (indicates increased failures)
- Retry attempt distribution
- Average time to successful delivery

### Alerts
- Alert if DLQ row creation rate exceeds threshold
- Alert if retry success rate drops below threshold
- Alert if database connection failures detected
- Alert if configuration validation fails on startup

## Future Enhancements

### Manual Replay
- Utility function to reconstruct email from DLQ row
- Manual trigger to retry DLQ-failed emails
- Audit trail of replayed messages

### DLQ Cleanup
- Retention policy for old DLQ rows (e.g., 90 days)
- Archive to cold storage for long-term retention
- Purge script for testing/development

### Advanced Retry Strategies
- Jitter to prevent thundering herd
- Circuit breaker pattern for cascading failures
- Adaptive retry limits based on error patterns

### Analytics
- Dashboard showing email delivery health
- Failure reasons breakdown (invalid recipient, rate limit, etc.)
- Recipient-level failure analysis
