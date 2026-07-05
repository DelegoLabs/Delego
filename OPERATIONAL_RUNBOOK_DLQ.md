# Operational Runbook: Email DLQ and Retry Management

## Quick Reference

### Health Check

```sql
-- Check if DLQ is healthy
SELECT COUNT(*) as total_failed_emails,
       COUNT(CASE WHEN created_at > NOW() - INTERVAL '24 hours' THEN 1 END) as last_24h,
       MAX(created_at) as last_failure
FROM failed_notifications;

-- Should show: Low total, normal daily rate, recent timestamps
```

### Common Commands

```bash
# View recent failures
psql $DATABASE_URL -c "
  SELECT recipient, template_name, attempts, error_message, created_at
  FROM failed_notifications
  WHERE created_at > NOW() - INTERVAL '1 hour'
  ORDER BY created_at DESC
  LIMIT 20;"

# Check service logs
tail -100 /var/log/delego/notifications.log

# Monitor real-time dispatches
tail -f /var/log/delego/notifications.log | grep "Email"
```

## Operations Scenarios

### Scenario 1: Investigating High DLQ Rate

**Problem**: Seeing > 1 failed email per minute in DLQ

**Step 1: Identify the Issue**

```sql
-- Find error pattern
SELECT error_message, COUNT(*) as count
FROM failed_notifications
WHERE created_at > NOW() - INTERVAL '1 hour'
GROUP BY error_message
ORDER BY count DESC;

-- Expected to see one dominant error
```

**Step 2: Check by Error Type**

If you see:
- **"400 Bad Request"** → Invalid email addresses
  ```sql
  SELECT DISTINCT recipient FROM failed_notifications
  WHERE error_message LIKE '%400%' AND created_at > NOW() - INTERVAL '1 hour'
  LIMIT 10;
  -- Verify email format, check against sender's database
  ```

- **"429 Too Many Requests"** → Rate limiting
  ```sql
  -- Count attempts
  SELECT attempts, COUNT(*) as count
  FROM failed_notifications
  WHERE error_message LIKE '%429%' AND created_at > NOW() - INTERVAL '1 hour'
  GROUP BY attempts;
  -- If attempts=1: not retrying, service quota hit
  -- If attempts>1: retried but still failed, increase backoff delay
  ```

- **"500/502/503"** → SendGrid service issues
  ```sql
  -- Check if issue is ongoing
  SELECT created_at, COUNT(*) as count
  FROM failed_notifications
  WHERE error_message LIKE '%50%' AND created_at > NOW() - INTERVAL '1 hour'
  GROUP BY DATE_TRUNC('minute', created_at)
  ORDER BY created_at;
  -- If clustered: service outage (wait and retry)
  -- If distributed: transient (should be retrying)
  ```

- **"ETIMEDOUT" or "ECONNREFUSED"** → Network issues
  ```sql
  -- Check consistency
  SELECT created_at, recipient, template_name
  FROM failed_notifications
  WHERE error_message ILIKE '%timeout%' OR error_message ILIKE '%refused%'
  AND created_at > NOW() - INTERVAL '1 hour'
  ORDER BY created_at DESC
  LIMIT 20;
  -- Network issues are transient, should be retrying
  -- If many 1-attempt entries: check retry configuration
  ```

**Step 3: Take Action**

Based on the error type:

| Error | Action |
|-------|--------|
| Invalid emails | Validate sender's email list; update before re-sending |
| Rate limiting | Increase `EMAIL_RETRY_BASE_DELAY_SECONDS`; contact SendGrid about quota |
| Service error | Check SendGrid status; wait 30 minutes; escalate if ongoing |
| Network timeout | Check service network; verify SendGrid accessibility; increase timeout tolerance |

### Scenario 2: Email Not Being Retried

**Problem**: All failed emails show `attempts=1` (no retries attempted)

**Investigation**:

```sql
-- Check attempt distribution
SELECT attempts, COUNT(*) as count, 
       COUNT(CASE WHEN created_at > NOW() - INTERVAL '1 hour' THEN 1 END) as last_hour
FROM failed_notifications
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY attempts
ORDER BY attempts;

-- Should see mix of attempts=2,3 (some retries)
-- If all =1: retries not happening
```

**Causes and Fixes**:

1. **Permanent errors classified as permanent** (correct behavior)
   ```sql
   -- Check error types in attempts=1
   SELECT error_message, COUNT(*) as count
   FROM failed_notifications
   WHERE attempts = 1 AND created_at > NOW() - INTERVAL '24 hours'
   GROUP BY error_message
   ORDER BY count DESC;
   -- Should see: 400, 401, 403, 404, "Invalid email", "Not found"
   -- If unexpected errors, review error classification logic
   ```

2. **Transient errors not retried** (configuration or code issue)
   ```bash
   # Check logs for retry decision
   tail -100 /var/log/delego/notifications.log | grep -i "retry\|transient\|permanent"
   # Should see: "Transient failure detected, retrying" or "Permanent failure detected"
   
   # Check configuration
   grep "EMAIL_MAX_RETRIES\|EMAIL_RETRY_BASE_DELAY" /var/log/delego/notifications.log | head -5
   # Should show configured retry limit > 1
   ```

3. **Retry delays too long** (user doesn't wait, checks email status)
   ```env
   # Reduce backoff if appropriate
   EMAIL_RETRY_BASE_DELAY_SECONDS=1  # from 2
   # Restart service
   systemctl restart delego-notifications
   ```

### Scenario 3: Manual Email Replay from DLQ

**Problem**: Need to resend email that failed and is in DLQ

**Step 1: Prepare for Manual Replay**

```sql
-- Find the failed email record
SELECT id, notification_id, recipient, template_name, payload, attempts, error_message
FROM failed_notifications
WHERE notification_id = '550e8400-e29b-41d4-a716-446655440000'
LIMIT 1;

-- Save payload for reconstruction
-- Example payload: {"orderId": "txn-123", "amount": "100 XLM", "approvalUrl": "https://..."}
```

**Step 2: Verify Issue Is Resolved**

Before replaying, ensure the original issue is fixed:

```bash
# If original error was rate limiting:
# - Wait 1 hour, check current SendGrid quota

# If original error was invalid email:
# - Verify recipient email is now correct
# - Contact user to provide correct email if needed

# If original error was temporary network issue:
# - Wait 10 minutes for network to stabilize
# - Verify SendGrid is accessible
```

**Step 3: Manual Resend Process**

Option A: Via API (if you have an API endpoint):

```bash
# Resend using dispatcher
curl -X POST http://localhost:3015/api/notifications/dispatch \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user-123",
    "email": "user@example.com",
    "transactionId": "txn-123",
    "amount": "100 XLM",
    "merchant": "Example Store",
    "approvalUrl": "https://example.com/approve"
  }'

# Monitor for success in logs
tail -f /var/log/delego/notifications.log | grep "Email delivered"
```

Option B: Direct database replay (advanced):

```sql
-- Create a replay job in a dispatch table (if one exists)
-- Or trigger manual dispatch via admin interface
```

**Step 4: Verify Success**

```bash
# Check logs for successful delivery
tail -100 /var/log/delego/notifications.log | grep -i "delivered"

# Confirm email was received by user (out-of-band verification)

# Optional: Delete old DLQ entry after successful replay
DELETE FROM failed_notifications
WHERE notification_id = '550e8400-e29b-41d4-a716-446655440000'
AND created_at < NOW() - INTERVAL '1 day';  -- Keep recent for audit
```

### Scenario 4: Database Performance Degradation

**Problem**: Email dispatch is getting slower, database queries timing out

**Investigation**:

```sql
-- Check failed_notifications table size
SELECT COUNT(*) as total_records,
       PG_SIZE_PRETTY(PG_TOTAL_RELATION_SIZE('failed_notifications')) as table_size
FROM failed_notifications;

-- If > 1 million records or > 100MB: consider archiving old entries

-- Check index health
SELECT schemaname, tablename, indexname, idx_scan, idx_tup_read, idx_tup_fetch
FROM pg_stat_user_indexes
WHERE tablename = 'failed_notifications'
ORDER BY idx_scan DESC;

-- Check index fragmentation
ANALYZE failed_notifications;
```

**Resolution**:

```sql
-- Reindex if fragmented
REINDEX TABLE failed_notifications;

-- Archive old entries (older than 90 days)
-- First, backup the data
CREATE TABLE failed_notifications_archive_old AS
SELECT * FROM failed_notifications
WHERE created_at < NOW() - INTERVAL '90 days';

-- Delete archived entries
DELETE FROM failed_notifications
WHERE created_at < NOW() - INTERVAL '90 days';

-- Vacuum to reclaim space
VACUUM failed_notifications;
ANALYZE failed_notifications;
```

### Scenario 5: Configuration Change Needed

**Problem**: Need to adjust retry strategy without redeploying

**Steps**:

1. **Update Configuration**:
```bash
# Edit environment file
vim /etc/delego/notifications.env

# Or set via deployment system
# Update EMAIL_MAX_RETRIES, EMAIL_RETRY_BASE_DELAY_SECONDS, EMAIL_DLQ_ENABLED
```

2. **Restart Service**:
```bash
# Graceful restart (in-flight requests complete)
systemctl restart delego-notifications

# Monitor startup
tail -f /var/log/delego/notifications.log

# Should see: "Email retry configuration loaded { EMAIL_MAX_RETRIES: ... }"
```

3. **Verify Configuration**:
```bash
# Check logs confirm new configuration
grep "Email retry configuration" /var/log/delego/notifications.log | tail -1
```

## Monitoring Dashboard Queries

### Email Delivery Health

```sql
-- Overview: delivery success rate
SELECT 
  DATE_TRUNC('hour', created_at) as hour,
  COUNT(*) as failures,
  (SELECT COUNT(*) FROM /* email_logs */) as total_attempts -- if logged
FROM failed_notifications
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY DATE_TRUNC('hour', created_at)
ORDER BY hour DESC;
```

### Retry Effectiveness

```sql
-- Retry success: entries with attempts > 1 (means they retried and succeeded)
-- This query approximates from DLQ (which only shows final failures)
SELECT attempts, COUNT(*) as dlq_entries
FROM failed_notifications
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY attempts
ORDER BY attempts;

-- If mostly attempts=1: Most errors are permanent (good)
-- If many attempts>1: Most errors are transient with retries (working well)
```

### Recipient-Level Analysis

```sql
-- Recipients with repeated failures (bad email addresses, domain issues)
SELECT recipient, COUNT(*) as failure_count, 
       JSON_OBJECT_AGG(template_name, COUNT(*)) as by_template
FROM failed_notifications
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY recipient
HAVING COUNT(*) > 2
ORDER BY failure_count DESC
LIMIT 20;
```

### Template-Level Analysis

```sql
-- Templates with high failure rate
SELECT template_name, COUNT(*) as total_failures,
       AVG(attempts) as avg_attempts,
       COUNT(CASE WHEN created_at > NOW() - INTERVAL '1 day' THEN 1 END) as failures_today
FROM failed_notifications
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY template_name
ORDER BY total_failures DESC;
```

## Alerts and Escalation

### Automated Monitoring Setup

```bash
# Example: DataDog monitor
# Check DLQ creation rate
FROM: failed_notifications
WHERE: created_at > Now - 60 minutes
COUNT() > 60  # Alert if > 1/minute

# Recommended actions:
# 1. Notify email delivery team
# 2. Check SendGrid status
# 3. Review recent configuration changes
# 4. Query failed_notifications for error pattern
```

### Escalation Path

1. **Alert triggered**: Check DLQ creation rate
2. **Immediate response** (< 5 min): 
   - Check SendGrid status page
   - Query DLQ for error pattern
   - Review logs for configuration issues
3. **Investigation** (5-30 min):
   - Identify affected recipients/templates
   - Check if issue is ongoing or intermittent
   - Review error classification logic
4. **Resolution** (30 min - 2 hours):
   - Fix configuration or code issue
   - Deploy fix if needed
   - Monitor metrics to verify improvement
5. **Post-mortem** (after incident):
   - Document root cause
   - Update alerting thresholds if needed
   - Improve monitoring/observability

## DLQ Maintenance

### Weekly Cleanup

```sql
-- Run weekly to keep DLQ manageable
DELETE FROM failed_notifications
WHERE created_at < NOW() - INTERVAL '90 days'
AND error_message LIKE '%404%';  -- Remove "not found" after 90 days

-- Verify retention policy
SELECT COUNT(*) as total,
       COUNT(CASE WHEN created_at < NOW() - INTERVAL '90 days' THEN 1 END) as archived,
       MAX(created_at) as latest,
       MIN(created_at) as oldest
FROM failed_notifications;
```

### Monthly Analysis

```sql
-- Generate monthly DLQ report
SELECT 
  DATE_TRUNC('month', created_at) as month,
  COUNT(*) as total_failures,
  COUNT(DISTINCT recipient) as unique_recipients,
  COUNT(DISTINCT template_name) as templates_affected,
  AVG(attempts) as avg_attempts,
  MAX(attempts) as max_attempts
FROM failed_notifications
GROUP BY DATE_TRUNC('month', created_at)
ORDER BY month DESC;

-- Use this to track trends and plan capacity
```

### Backup DLQ Data

```sql
-- Monthly backup of DLQ for compliance/investigation
CREATE TABLE failed_notifications_backup_2024_march AS
SELECT * FROM failed_notifications
WHERE created_at BETWEEN '2024-03-01' AND '2024-03-31';

-- Keep backups for 12 months for compliance
```

## Emergency Procedures

### If DLQ Table Grows Too Large

```sql
-- Emergency: Delete old entries to free space
DELETE FROM failed_notifications
WHERE created_at < NOW() - INTERVAL '30 days'
AND error_message LIKE '%timeout%';  -- Start with non-critical errors

-- If still too large, be more aggressive
DELETE FROM failed_notifications
WHERE created_at < NOW() - INTERVAL '7 days';

-- Then optimize
VACUUM full failed_notifications;
```

### If Email Dispatch Stops Completely

```bash
# Check service is running
systemctl status delego-notifications

# Check logs for errors
tail -100 /var/log/delego/notifications.log | grep -i error

# Restart if needed
systemctl restart delego-notifications

# Monitor for recovery
tail -f /var/log/delego/notifications.log
```

### If DLQ Logging Fails

```bash
# Set DLQ to disabled temporarily
EMAIL_DLQ_ENABLED=false

# Restart service
systemctl restart delego-notifications

# Investigate database issue while retries continue
# Re-enable after fix
EMAIL_DLQ_ENABLED=true
systemctl restart delego-notifications
```

## Contacts and Escalation

- **Email Delivery Team**: [contact info]
- **SendGrid Support**: [contact info]
- **Database Team**: [contact info]
- **On-Call Engineer**: [escalation procedure]

## Document History

| Date | Version | Changes |
|------|---------|---------|
| 2024-01-15 | 1.0 | Initial version |
