# Deployment Guide: Email Retry and Dead-Letter Queue Feature

## Overview

This guide covers deploying the email retry and Dead-Letter Queue (DLQ) feature for the Delego notifications service. The feature adds resilient email delivery with automatic retry on transient failures and persistent tracking of permanently failed emails.

## Pre-Deployment Checklist

### Configuration Review
- [ ] Review `EMAIL_MAX_RETRIES` for target environment (default: 3, range: 1-10)
- [ ] Review `EMAIL_RETRY_BASE_DELAY_SECONDS` for target environment (default: 2)
- [ ] Verify `EMAIL_DLQ_ENABLED` is set appropriately (default: true)
- [ ] Confirm `SENDGRID_API_KEY` is set in target environment
- [ ] Verify `DATABASE_URL` is accessible from service
- [ ] Verify `LOG_LEVEL` for monitoring during initial deployment

### Database Readiness
- [ ] Backup existing database (PostgreSQL)
- [ ] Verify database is accessible from service
- [ ] Confirm database pool settings (`DATABASE_POOL_MIN`, `DATABASE_POOL_MAX`)
- [ ] Test connectivity to database from deployment environment

### Dependencies
- [ ] Verify all npm packages are installed (`pnpm install`)
- [ ] Confirm TypeScript compilation succeeds (`pnpm build`)
- [ ] Run test suite (`pnpm test` in notifications package)
- [ ] Verify code coverage meets 85% threshold

### Staging Environment Validation
- [ ] Deploy to staging environment
- [ ] Run database migrations on staging
- [ ] Execute end-to-end tests with real SendGrid sandbox
- [ ] Verify retry behavior with mocked transient failures
- [ ] Monitor logs for configuration validation messages
- [ ] Query `failed_notifications` table to verify DLQ functionality

## Deployment Steps

### 1. Pre-Deployment (Non-Breaking)
These steps can be done before the feature is activated:

```bash
# Install dependencies
pnpm install

# Compile TypeScript
pnpm --filter @delego/notifications build

# Run tests
pnpm --filter @delego/notifications test

# Verify no compilation errors
pnpm --filter @delego/notifications typecheck
```

### 2. Database Migration

Run migrations to create the `failed_notifications` table:

```bash
# Option A: Via Node.js script (if migration runner is configured)
NODE_ENV=production pnpm --filter @delego/notifications migrate

# Option B: Manual Sequelize migration
# Create migration runner script or use Sequelize CLI if available
```

**Important**: This step creates the `failed_notifications` table. It is idempotent and safe to run multiple times.

Expected migration output:
```
Database connection established successfully.
Creating failed_notifications table...
Creating indices on (recipient, created_at) and notification_id...
Migration completed successfully.
```

### 3. Deploy Code

Deploy the new code to production:

```bash
# Build the notifications service
pnpm --filter @delego/notifications build

# Deploy dist/ directory to target environment
# (via your deployment process: Docker, direct push, CI/CD, etc.)
```

### 4. Start Service with New Configuration

Set environment variables and start the notifications service:

```bash
# Set configuration variables (add to .env or deployment config)
EMAIL_MAX_RETRIES=3
EMAIL_RETRY_BASE_DELAY_SECONDS=2
EMAIL_DLQ_ENABLED=true
SENDGRID_API_KEY=<your-sendgrid-key>
DATABASE_URL=postgresql://user:pass@host:5432/delego
LOG_LEVEL=info  # or debug for more detailed logs during verification

# Start service
npm start
# or via process manager: systemctl start delego-notifications
```

### 5. Verify Deployment

Check that the service started correctly:

```bash
# Verify logs show configuration loaded
# Expected: "Email retry configuration loaded { EMAIL_MAX_RETRIES: 3, ... }"

# Test email dispatch
curl -X POST http://localhost:3015/api/dispatch \
  -H "Content-Type: application/json" \
  -d '{"userId":"test","email":"user@example.com",...}'

# Verify no errors in logs
# Check for: "Database connection established successfully"
```

### 6. Monitor Initial Dispatches

Monitor the logs for the first hour of production traffic:

```bash
# Watch logs for email dispatches
tail -f /var/log/delego/notifications.log

# Expected log patterns:
# - "[notifications:email] DEBUG Email delivered successfully"
# - "[notifications:config] INFO Email retry configuration loaded"

# Alert conditions:
# - "[notifications:dlq] WARN Email moved to Dead-Letter Queue"
# - "[notifications:config] ERROR configuration validation failed"
```

### 7. Query DLQ to Verify Functionality

Verify the DLQ is working:

```sql
-- Check if failed_notifications table exists
SELECT * FROM failed_notifications LIMIT 1;

-- Count total failed emails (should be minimal)
SELECT COUNT(*) as total_failed_emails FROM failed_notifications;

-- Check recent failures
SELECT recipient, template_name, attempts, error_message, created_at
FROM failed_notifications
WHERE created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC;
```

## Configuration Tuning

### For High-Volume Environments

If experiencing high failure rates:

```env
# Increase retry attempts for transient-heavy failures
EMAIL_MAX_RETRIES=5

# Increase backoff delay to reduce SendGrid rate limiting
EMAIL_RETRY_BASE_DELAY_SECONDS=3
```

### For Quick Recovery Environments

If you want faster retries:

```env
# Decrease retry limit
EMAIL_MAX_RETRIES=2

# Decrease backoff delay (be careful with rate limiting)
EMAIL_RETRY_BASE_DELAY_SECONDS=1
```

### For Testing/Development

If you want to disable DLQ in test environments:

```env
# Disable DLQ logging
EMAIL_DLQ_ENABLED=false

# Use minimal retry for faster test execution
EMAIL_MAX_RETRIES=1
EMAIL_RETRY_BASE_DELAY_SECONDS=0.1
```

## Monitoring and Alerting

### Key Metrics to Monitor

1. **Email Dispatch Success Rate**
   ```sql
   -- Query from logs (if structured logging is available)
   -- Expected: > 95% success rate on first attempt
   -- Acceptable: > 99% success rate after retries
   ```

2. **DLQ Creation Rate**
   ```sql
   SELECT DATE_TRUNC('hour', created_at) as hour,
          COUNT(*) as dlq_entries
   FROM failed_notifications
   GROUP BY DATE_TRUNC('hour', created_at)
   ORDER BY hour DESC;
   
   -- Alert if rate > 1 per minute
   ```

3. **Retry Success Rate**
   ```sql
   -- Count emails that required retries (from logs)
   -- Expected: > 80% of transient failures succeed on retry
   ```

4. **Average Attempts to Success**
   ```sql
   -- From logs: distribution of attempts needed
   -- Expected: Most emails succeed on first attempt (1)
   -- Some on retry (2-3)
   ```

### Recommended Alerts

Set up monitoring alerts in your alerting system (DataDog, New Relic, CloudWatch, etc.):

| Alert | Threshold | Action |
|-------|-----------|--------|
| DLQ creation rate | > 60/hour | Investigate SendGrid service or email configuration |
| Email dispatch failure rate | > 5% overall | Check SENDGRID_API_KEY validity and rate limits |
| Retry success rate | < 70% | Review error classification or increase EMAIL_MAX_RETRIES |
| Database connection failures | Any | Check DATABASE_URL and network connectivity |
| Configuration validation failed | Any | Check environment variables on startup |

### Logging Samples

Example logs to look for during verification:

```
✓ Configuration loaded:
[notifications:config] INFO Email retry configuration loaded {"EMAIL_MAX_RETRIES":3,"EMAIL_RETRY_BASE_DELAY_SECONDS":2,"EMAIL_DLQ_ENABLED":true}

✓ Successful dispatch:
[notifications:email] DEBUG Email delivered successfully {"notificationId":"550e8400...","recipient":"user@example.com","userId":"user-123","attempt":1}

✓ Retry attempt:
[notifications:email] INFO Transient failure detected, retrying {"notificationId":"550e8400...","recipient":"user@example.com","userId":"user-123","failureReason":"ETIMEDOUT","currentAttempt":1,"nextAttemptIn":"2s"}

✓ DLQ entry:
[notifications:dlq] WARN Email moved to Dead-Letter Queue {"notificationId":"550e8400...","recipient":"user@example.com","attempts":3,"errorMessageSummary":"..."}
```

## Troubleshooting

### Issue: Too many emails in DLQ

**Symptoms**: DLQ row creation rate > 60/hour

**Investigation**:
```sql
-- Find most common error types
SELECT error_message, COUNT(*) as count
FROM failed_notifications
WHERE created_at > NOW() - INTERVAL '1 hour'
GROUP BY error_message
ORDER BY count DESC;

-- Find recipients with multiple failures
SELECT recipient, COUNT(*) as count
FROM failed_notifications
WHERE created_at > NOW() - INTERVAL '1 hour'
GROUP BY recipient
ORDER BY count DESC;
```

**Common Causes**:
- **Invalid email addresses**: Review recipient validation
- **SendGrid rate limit**: Increase `EMAIL_RETRY_BASE_DELAY_SECONDS` or reduce traffic
- **SendGrid API key issues**: Verify SENDGRID_API_KEY is valid and has sufficient quota
- **Network issues**: Check database and service connectivity

**Resolution**:
- Invalid emails: Fix recipient list before re-sending
- Rate limiting: Adjust backoff strategy or contact SendGrid about limits
- API key: Verify key and quota in SendGrid dashboard
- Network: Verify connectivity and database pool settings

### Issue: Emails not being retried

**Symptoms**: Low attempt count in DLQ entries (all show attempts: 1)

**Investigation**:
```sql
-- Check if retries are being attempted
SELECT attempts, COUNT(*) as count
FROM failed_notifications
WHERE created_at > NOW() - INTERVAL '1 hour'
GROUP BY attempts;

-- Should show attempts: 2, 3 for some entries (indicating retries)
```

**Common Causes**:
- Error classification too aggressive: Permanent failures classified incorrectly
- EMAIL_MAX_RETRIES set to 0 or 1
- Log level too low to see retry attempts

**Resolution**:
- Review error classification logic for false positives
- Increase EMAIL_MAX_RETRIES to at least 2
- Set LOG_LEVEL=debug temporarily to see retry details

### Issue: Slow email dispatch (high latency)

**Symptoms**: Email delivery takes 30+ seconds

**Investigation**:
- Check logs for retry delay calculations
- Monitor database query times
- Check SendGrid API response times

**Common Causes**:
- `EMAIL_RETRY_BASE_DELAY_SECONDS` too high
- Database connection pool exhausted
- SendGrid rate limiting causing slow responses

**Resolution**:
- Reduce backoff delay if appropriate for your traffic
- Increase DATABASE_POOL_MAX
- Review SendGrid rate limits and request distribution

### Issue: Database connection errors

**Symptoms**: Errors in logs like "Database connection failed"

**Investigation**:
```bash
# Test database connectivity
psql -h $DATABASE_HOST -U $DATABASE_USER -d $DATABASE_NAME -c "SELECT NOW();"

# Check database pool status
# From application logs or monitoring dashboard
```

**Common Causes**:
- Incorrect DATABASE_URL format
- Database server not accessible from service
- Database pool exhausted

**Resolution**:
- Verify DATABASE_URL: `postgresql://user:pass@host:port/dbname`
- Check firewall rules and network connectivity
- Increase DATABASE_POOL_MAX or reduce connection usage
- Restart connection pool: restart service (non-breaking)

## Rollback Procedures

### If Critical Issues Detected

#### Option 1: Immediate Rollback (Preserve DLQ Data)

```bash
# 1. Revert code to previous version
git revert <current-commit>
pnpm build
# Deploy previous version

# 2. The DLQ table remains (data is preserved)
# Future dispatches use new code
# Investigation can continue on existing DLQ entries
```

#### Option 2: Disable DLQ Temporarily

If only DLQ logging is problematic:

```bash
# Set environment variable
EMAIL_DLQ_ENABLED=false

# Restart service
# Email retry will continue, but won't log to DLQ
# Re-enable after investigation
```

#### Option 3: Revert Configuration Changes

If configuration values are problematic:

```env
# Revert to safer defaults
EMAIL_MAX_RETRIES=2
EMAIL_RETRY_BASE_DELAY_SECONDS=5
EMAIL_DLQ_ENABLED=true

# Restart service
# Existing DLQ entries remain for investigation
```

### Rollback Verification

After rollback, verify:

```bash
# Check service health
curl http://localhost:3015/health

# Verify emails are dispatching
# Check logs for dispatch activity

# Query DLQ to confirm data preserved
SELECT COUNT(*) FROM failed_notifications;

# Confirm no new DLQ entries if DLQ is disabled
SELECT created_at FROM failed_notifications 
ORDER BY created_at DESC LIMIT 5;
```

## DLQ Query Examples

### Find Failed Emails for Manual Replay

```sql
-- Find all failed emails for a specific user
SELECT * FROM failed_notifications
WHERE payload->>'userId' = 'user-123'
ORDER BY created_at DESC;

-- Find emails that failed due to timeout
SELECT * FROM failed_notifications
WHERE error_message ILIKE '%timeout%'
ORDER BY created_at DESC;

-- Find emails that failed in the last 24 hours
SELECT * FROM failed_notifications
WHERE created_at > NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC;
```

### Query for Alerting

```sql
-- Count DLQ entries in last hour
SELECT COUNT(*) as dlq_entries_1h
FROM failed_notifications
WHERE created_at > NOW() - INTERVAL '1 hour';

-- Find recipients with repeated failures
SELECT recipient, COUNT(*) as failure_count, MAX(created_at) as latest
FROM failed_notifications
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY recipient
HAVING COUNT(*) > 2
ORDER BY failure_count DESC;
```

### DLQ Cleanup (if needed)

```sql
-- Archive old DLQ entries (optional, 90+ day retention)
-- Create archive table first, then delete
DELETE FROM failed_notifications
WHERE created_at < NOW() - INTERVAL '90 days';

-- Or select into archive
SELECT * INTO failed_notifications_archive_2024_q1
FROM failed_notifications
WHERE created_at BETWEEN '2024-01-01' AND '2024-03-31';

DELETE FROM failed_notifications
WHERE created_at BETWEEN '2024-01-01' AND '2024-03-31';
```

## Performance Considerations

### Database Indexing

The migration creates two indices automatically:

```sql
-- Indices created by migration
CREATE INDEX idx_failed_notifications_recipient_created_at 
ON failed_notifications(recipient, created_at);

CREATE INDEX idx_failed_notifications_notification_id 
ON failed_notifications(notification_id);
```

These enable efficient queries:
- By recipient + time range (operator investigation)
- By notification ID (quick lookup)

### Connection Pooling

Configure connection pool based on expected load:

```env
# Default settings (conservative)
DATABASE_POOL_MIN=2
DATABASE_POOL_MAX=10

# For high-volume environments
DATABASE_POOL_MIN=5
DATABASE_POOL_MAX=20

# For low-traffic environments
DATABASE_POOL_MIN=1
DATABASE_POOL_MAX=5
```

### Memory Usage

Email retry logic is minimal overhead:
- Each retry uses exponential backoff (memory-efficient)
- DLQ records are stored in database (not in-memory)
- Typical memory increase: < 5MB for the feature

## Support and Escalation

### If Deployment Fails

1. Check configuration validation logs
2. Verify database connectivity
3. Run diagnostic tests
4. Consult troubleshooting section above

### If Issues Persist

1. Gather logs: `tail -1000 /var/log/delego/notifications.log`
2. Query DLQ for error patterns
3. Review configuration settings
4. Check SendGrid API status and quota
5. Verify database connectivity and health

## Success Criteria

After deployment, verify:

- [ ] Service starts without configuration errors
- [ ] At least one email successfully dispatched (appears in logs)
- [ ] `failed_notifications` table exists with correct schema
- [ ] No errors in initial deployment logs
- [ ] DLQ queries return results for test emails
- [ ] Email retry configuration logged at startup
- [ ] Email dispatch success rate > 95% within first hour
