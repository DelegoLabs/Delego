# Tasks

## Task 1: Create Database Migration and FailedNotification Model

**Type:** Implementation Task

**Scope:**
- Create a Sequelize migration file to add the `failed_notifications` table to PostgreSQL
- Implement the `FailedNotification` Sequelize model following the gateway pattern
- Add indices on (recipient, created_at) and notification_id
- Ensure migration is idempotent and can be run multiple times safely

**Subtasks:**
1. Create migration file: `apps/backend/notifications/src/migrations/001_create_failed_notifications.ts`
2. Create model file: `apps/backend/notifications/src/models/FailedNotification.ts`
3. Implement migration logic to create table with correct schema
4. Implement FailedNotification model with Sequelize decorators
5. Export model from `apps/backend/notifications/src/models/index.ts`
6. Verify migration runs successfully on clean database

**Acceptance Criteria:**
- Migration creates `failed_notifications` table with all required columns
- Table has UUID primary key with auto-generation
- Indices created on (recipient, created_at) and notification_id
- FailedNotification model exports correctly
- Migration is idempotent (can run multiple times without error)
- Column types match schema: STRING for text fields, JSONB for payload, TIMESTAMP for timestamps
- Sequelize timestamps (createdAt, updatedAt) work automatically

**Testing:**
- Migration can run on clean PostgreSQL database
- Model can be imported without errors
- Model methods (create, findOne, findAll) work as expected

---

## Task 2: Implement Error Classification and Retry Configuration

**Type:** Implementation Task

**Scope:**
- Create error classification function to distinguish transient vs permanent failures
- Implement configuration loading and validation for EMAIL_MAX_RETRIES, EMAIL_RETRY_BASE_DELAY_SECONDS, EMAIL_DLQ_ENABLED
- Add configuration validation on startup
- Add comprehensive logging for configuration values

**Subtasks:**
1. Create `apps/backend/notifications/src/email/errorClassifier.ts` with classification logic
2. Create `apps/backend/notifications/src/email/config.ts` for configuration loading
3. Implement transient/permanent classification for SendGrid and network errors
4. Implement exponential backoff delay calculation (2^(attempt-1) * base, max 120s)
5. Add configuration validation with range checking (MAX_RETRIES: 1-10)
6. Add INFO-level logging of configuration on startup
7. Add DEBUG-level logging of retry delay calculation

**Acceptance Criteria:**
- Error classification correctly identifies transient errors (429, 5xx, ETIMEDOUT, ECONNREFUSED)
- Error classification correctly identifies permanent errors (400, 401, 403, 404, invalid email format)
- Unknown errors default to transient (retry)
- Configuration loads from environment variables with correct defaults
- Configuration validation throws error if invalid (non-integer, out of range)
- Configuration logged at startup (EMAIL_MAX_RETRIES, EMAIL_RETRY_BASE_DELAY_SECONDS, EMAIL_DLQ_ENABLED)
- Exponential backoff formula: attempt 1 = 0s, attempt 2 = 2s, attempt 3 = 4s (with base=2)
- Max delay capped at 120 seconds

**Testing:**
- Unit tests for error classification covering all error types
- Unit tests for configuration loading with valid/invalid values
- Unit tests for exponential backoff calculation
- Configuration validation throws on invalid input

---

## Task 3: Implement sendEmailWithRetry() Function

**Type:** Implementation Task

**Scope:**
- Implement the main `sendEmailWithRetry()` function with retry logic
- Integrate exponential backoff delays between retries
- Use error classification to determine whether to retry
- Integrate with existing `sendEmail()` function
- Add comprehensive logging for each retry attempt

**Subtasks:**
1. Create `apps/backend/notifications/src/email/retry.ts` with sendEmailWithRetry implementation
2. Implement EmailDispatchJob interface matching requirements
3. Implement sendEmailWithRetry with recursive retry logic
4. Integrate exponential backoff waiting between attempts
5. Use error classifier to determine transient vs permanent failures
6. Log INFO on each retry attempt with context (notification_id, recipient, attempt count)
7. Log DEBUG on successful delivery (any attempt)
8. Propagate permanent failures immediately without retry
9. Track attempt counter through recursive calls

**Acceptance Criteria:**
- Function signature matches `sendEmailWithRetry(job: EmailDispatchJob, attempt?: number): Promise<void>`
- Successful dispatch on first attempt returns immediately
- Successful dispatch on any retry returns success
- Transient failure retries up to MAX_RETRIES attempts
- Permanent failure throws immediately without retry
- Exponential backoff applied between retries
- EmailDispatchJob preserved unchanged across all retry attempts
- Logging includes notificationId, recipient, templateName, userId, attemptCount
- Preserve existing sendEmail contract (throw on failure)

**Testing:**
- Unit test: Success on first attempt (no retry)
- Unit test: Success on retry attempt (2nd or 3rd)
- Unit test: Permanent failure on first attempt (no retry)
- Unit test: Transient failure exhausts max retries
- Integration test: End-to-end with mocked SendGrid

---

## Task 4: Implement logToDLQ() Function and Database Integration

**Type:** Implementation Task

**Scope:**
- Implement the `logToDLQ()` function to insert failed notifications into database
- Handle database errors gracefully (log but don't throw)
- Prevent duplicate DLQ entries for the same notification/recipient
- Truncate error messages to 2000 characters
- Add WARN-level logging when moving email to DLQ

**Subtasks:**
1. Implement logToDLQ function in `apps/backend/notifications/src/email/dlq.ts`
2. Create database connection for notifications service
3. Implement DLQ row insertion with all required fields
4. Add deduplication check for (notificationId, recipient) pair
5. Implement error message truncation (2000 char limit)
6. Add error handling for database failures (log, don't throw)
7. Log WARN on DLQ insertion with complete context
8. Implement database connection pooling and lifecycle management

**Acceptance Criteria:**
- logToDLQ inserts row with all fields: notification_id, recipient, template_name, payload, error_message, attempts, created_at, updated_at
- Error message truncated to 2000 characters maximum
- Database connection established to same PostgreSQL as gateway
- DLQ row creation includes timestamp (current time)
- Database errors logged but not thrown (no exception propagation)
- Non-database errors (validation, logic errors) propagate as exceptions
- WARN-level log includes: notificationId, recipient, templateName, attempts, errorMessage summary
- Duplicate prevention: check if (notificationId, recipient) already exists before insert

**Testing:**
- Integration test: DLQ row creation on database
- Integration test: Row persistence across service restart
- Integration test: Error message truncation
- Integration test: Database connection failure handling
- Integration test: Duplicate entry prevention

---

## Task 5: Update Email Dispatcher to Use Retry Function

**Type:** Implementation Task

**Scope:**
- Update the dispatcher to call `sendEmailWithRetry()` instead of `sendEmail()`
- Construct EmailDispatchJob from TransactionApprovalNotification
- Preserve idempotency key behavior
- Maintain error handling for dispatcher-level errors
- Add integration with new retry/DLQ pipeline

**Subtasks:**
1. Update `apps/backend/notifications/src/dispatcher.ts` to import sendEmailWithRetry
2. Construct EmailDispatchJob with correct fields (notificationId, recipient, templateName, payload, userId)
3. Generate unique notificationId for each dispatch (UUID)
4. Replace sendEmail call with sendEmailWithRetry call
5. Preserve checkAndMarkDispatched idempotency logic
6. Keep existing error handling (catch and log)
7. Update error logging to include retry context
8. Test that idempotency keys still work with retry mechanism

**Acceptance Criteria:**
- Dispatcher constructs valid EmailDispatchJob from notification
- sendEmailWithRetry called with complete job data
- Idempotency check still prevents duplicate sends
- Error handling catches and logs failures
- Logging includes notificationId, recipient, userId, attemptCount
- Backward compatible (existing error contract preserved)
- No breaking changes to dispatcher interface

**Testing:**
- Integration test: Email sent successfully through dispatcher
- Integration test: Duplicate dispatch prevented by idempotency key
- Integration test: Failed email logged to DLQ
- Integration test: Retry attempts respect MAX_RETRIES

---

## Task 6: Add Configuration to Environment and Documentation

**Type:** Implementation Task

**Scope:**
- Add new environment variables to `.env.example`
- Update README documentation for notifications service
- Document new configuration options
- Document DLQ table and schema
- Add deployment/operational notes

**Subtasks:**
1. Update `c:\github repo\Delego\.env.example` with EMAIL_MAX_RETRIES, EMAIL_RETRY_BASE_DELAY_SECONDS, EMAIL_DLQ_ENABLED
2. Update `apps/backend/notifications/README.md` with new environment variables
3. Document DLQ table schema and querying examples
4. Document retry behavior and configuration
5. Add operational notes for monitoring and alerting
6. Document manual replay procedure (if future enhancement implemented)
7. Add troubleshooting section for common email issues

**Acceptance Criteria:**
- `.env.example` includes all new environment variables with defaults and descriptions
- README documents each variable with purpose, default, and range
- DLQ table schema documented with column descriptions
- Examples provided for querying failed emails
- Retry behavior documented (exponential backoff formula, attempt limits)
- Deployment instructions clear
- Troubleshooting guide covers common failure modes

**Testing:**
- Environment file can be parsed without errors
- Documentation is accurate and complete
- Examples in documentation are correct

---

## Task 7: Write Unit and Integration Tests for Retry Logic

**Type:** Test Task

**Scope:**
- Write comprehensive unit tests for error classification
- Write unit tests for sendEmailWithRetry function
- Write integration tests for DLQ persistence
- Write property-based tests for retry behavior
- Achieve 85% code coverage for retry/DLQ modules

**Subtasks:**
1. Create `apps/backend/notifications/src/email/errorClassifier.test.ts` with error classification tests
2. Create `apps/backend/notifications/src/email/retry.test.ts` with retry logic tests
3. Create `apps/backend/notifications/src/email/dlq.test.ts` with DLQ persistence tests
4. Implement property-based tests using fast-check or similar
5. Test successful dispatch writes no DLQ row (property-based)
6. Test failed dispatch after max retries writes exactly one DLQ row (property-based)
7. Test retry timing follows exponential backoff formula
8. Add concurrent dispatch tests for duplicate DLQ prevention
9. Generate coverage report and verify 85% threshold

**Acceptance Criteria:**
- Unit test: Error classification for HTTP 429, 5xx, 400, 401, 403, 404, network errors
- Unit test: Success on first attempt
- Unit test: Success on retry attempt (2nd or 3rd)
- Unit test: Permanent failure on first attempt (no retry)
- Unit test: Transient failure exhausts max retries
- Integration test: End-to-end dispatch with mocked SendGrid
- Integration test: DLQ row creation on database
- Integration test: Database persistence across service restart
- Integration test: Concurrent requests don't create duplicate DLQ rows
- Property-based test: Success never creates DLQ row (any payload/recipient)
- Property-based test: Failure always creates exactly one DLQ row
- Property-based test: Retry timing follows exponential backoff
- Code coverage at 85% or above
- Build fails if coverage drops below threshold

**Testing:**
- All tests pass with `npm test` in notifications package
- Coverage report generated and meets threshold
- Property-based tests cover wide range of input values

---

## Task 8: Verify Integration with Existing Notification Flow

**Type:** Verification Task

**Scope:**
- End-to-end test of email notifications through full stack
- Verify idempotency keys work with retry mechanism
- Verify DLQ captures failed emails with complete context
- Verify dispatcher integration doesn't break existing functionality
- Verify database connection and migrations work in staging

**Subtasks:**
1. Create integration test for transaction approval email flow
2. Simulate successful send (verify no DLQ row created)
3. Simulate transient failure with retry (verify success on retry)
4. Simulate permanent failure (verify DLQ row created immediately)
5. Simulate max retries exceeded (verify DLQ row with proper attempt count)
6. Query DLQ to verify row contains complete context (payload, template, recipient)
7. Test idempotency key behavior with retry mechanism
8. Test concurrent dispatch requests for duplicate DLQ prevention
9. Run migrations on clean database and verify schema
10. Verify existing error handling code still works

**Acceptance Criteria:**
- End-to-end transaction approval email succeeds and no DLQ row created
- Transient failure results in retry and eventual success
- Permanent failure results in immediate DLQ logging
- DLQ row contains all required fields: notification_id, recipient, template_name, payload, error_message, attempts, created_at
- DLQ row can be queried to diagnose failed email
- Idempotency keys prevent duplicate sends even with retries
- Concurrent requests don't create duplicate DLQ rows
- Migrations run successfully on clean database
- Existing error handling and logging still work
- No breaking changes to dispatcher interface
- Documentation is accurate and complete

**Testing:**
- Integration tests pass for all scenarios
- Database queries return expected results
- Migration scripts are idempotent

---

## Task 9: Document and Prepare for Deployment

**Type:** Documentation Task

**Scope:**
- Create deployment checklist
- Document rollback procedures
- Create operational runbook for DLQ queries
- Document monitoring and alerting setup
- Create troubleshooting guide

**Subtasks:**
1. Create deployment checklist (pre-deploy, deploy, post-deploy steps)
2. Document rollback procedures for code and schema
3. Create runbook for common DLQ queries (query failed emails, replay procedure outline)
4. Document monitoring metrics and alerting thresholds
5. Create troubleshooting guide for common email issues
6. Document configuration tuning (retry limits, backoff strategy)
7. Add performance considerations (database indexing, connection pooling)
8. Document security considerations (DLQ data access, error message truncation)

**Acceptance Criteria:**
- Deployment checklist is clear and complete
- Rollback procedures are documented and tested
- Runbook provides SQL queries for common DLQ operations
- Monitoring metrics identified (success rate, DLQ row creation rate, retry distribution)
- Troubleshooting guide covers common failure modes
- Configuration tuning guidance provided
- Security considerations documented
- Performance considerations documented

**Testing:**
- Deployment checklist can be followed step-by-step
- Rollback procedures work correctly
- Runbook queries return expected results
- Documentation is accurate and complete

