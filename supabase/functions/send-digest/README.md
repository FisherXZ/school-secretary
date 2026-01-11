# send-digest Edge Function

The core cron job that sends daily digest emails to all subscribed users.

## What it does

1. Queries database for all users with `digest_enabled = true`
2. For each user:
   - Refreshes Google access token if expired
   - Fetches next 7 days of calendar events
   - Filters to homework only (events with `canvasAssignmentId` tag)
   - Groups into "Today" and "This Week"
   - Sends formatted email via Resend
3. Returns summary of success/failure counts

## Required Environment Variables

Set these in Supabase Dashboard → **Edge Functions → Manage secrets**:

```bash
RESEND_API_KEY=re_xxxxxxxxxxxxx
GOOGLE_CLIENT_ID=862922347346-xxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxxxxxxx
```

Auto-injected by Supabase:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Deployment

```bash
supabase functions deploy send-digest
```

## Testing

### Manual Trigger (Test with Real Users)

```bash
curl -X POST https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-digest \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY"
```

This will send emails to ALL users with `digest_enabled = true`. Use with caution!

### Test with Single User

For safer testing, temporarily disable digest for all users except one test user:

```sql
-- Disable all users
UPDATE users SET digest_enabled = false;

-- Enable only test user
UPDATE users SET digest_enabled = true WHERE email = 'your-test@example.com';
```

Then trigger the function:

```bash
curl -X POST https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-digest \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY"
```

Expected response:

```json
{
  "success": true,
  "processed": 1,
  "failed": 0,
  "total": 1
}
```

### Re-enable All Users

```sql
UPDATE users SET digest_enabled = true;
```

## Setting Up Daily Cron

After deploying and testing, set up the daily cron job.

### 1. Enable pg_cron Extension

Go to Supabase Dashboard → **Database → Extensions** → Enable `pg_cron`

### 2. Schedule the Job

Go to **SQL Editor** and run:

```sql
-- Schedule digest to run at 8am PST (4pm UTC)
-- Adjust cron time based on your primary user timezone
SELECT cron.schedule(
  'send-morning-digest',
  '0 16 * * *',  -- Cron format: minute hour day month weekday
  $$
  SELECT net.http_post(
    url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-digest',
    headers := '{"Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
  );
  $$
);
```

### Cron Time Reference

Common timezones for 8am send time:

| Timezone | UTC Offset | 8am Local = UTC Time | Cron Expression |
|----------|------------|---------------------|-----------------|
| PST (Pacific) | UTC-8 | 4:00 PM UTC | `0 16 * * *` |
| EST (Eastern) | UTC-5 | 1:00 PM UTC | `0 13 * * *` |
| CST (Central) | UTC-6 | 2:00 PM UTC | `0 14 * * *` |
| GMT (London) | UTC+0 | 8:00 AM UTC | `0 8 * * *` |

> **Note:** Adjust for Daylight Saving Time if needed. Some regions shift UTC offset.

### 3. Verify Cron Setup

```sql
-- View all cron jobs
SELECT * FROM cron.job;

-- Expected output:
-- jobid | schedule    | command                        | nodename | ...
-- 1     | 0 16 * * *  | SELECT net.http_post(...)      | ...

-- View recent cron runs
SELECT
  job_run_details.job_id,
  job_run_details.status,
  job_run_details.start_time,
  job_run_details.end_time,
  job_run_details.return_message
FROM cron.job_run_details
ORDER BY start_time DESC
LIMIT 10;
```

### Update Cron Schedule

To change the send time:

```sql
-- First, unschedule the old job
SELECT cron.unschedule('send-morning-digest');

-- Then, schedule with new time
SELECT cron.schedule(
  'send-morning-digest',
  '0 15 * * *',  -- New time: 7am PST (3pm UTC)
  $$
  SELECT net.http_post(
    url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-digest',
    headers := '{"Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
  );
  $$
);
```

## Monitoring

### View Function Logs

Dashboard:
- Go to **Edge Functions → send-digest → Logs**

CLI:
```bash
supabase functions logs send-digest --follow
```

### View Cron Run History

```sql
SELECT
  status,
  start_time,
  end_time,
  return_message
FROM cron.job_run_details
WHERE job_id = (SELECT jobid FROM cron.job WHERE jobname = 'send-morning-digest')
ORDER BY start_time DESC
LIMIT 10;
```

### Key Metrics to Monitor

- **Success rate**: `processed / total` should be close to 100%
- **Failed count**: Should be 0 or very low
- **Errors array**: Check for patterns (e.g., all token refresh failures)

## Debugging

### Common Issues

**"Token refresh failed"**

Possible causes:
1. User revoked access to their Google Calendar
2. Refresh token is invalid or expired
3. Google OAuth credentials are incorrect

Fix:
```sql
-- Check affected user
SELECT email, token_expires_at FROM users WHERE id = 'USER_ID';

-- User needs to re-authenticate via extension
-- Or manually update refresh token if you have it
```

**"Calendar fetch failed"**

Possible causes:
1. Google Calendar API quota exceeded
2. Invalid calendar permissions
3. Network issues

Check Google Cloud Console → APIs & Services → Calendar API for quota usage.

**"Email send failed"**

Possible causes:
1. Resend API key invalid
2. Domain not verified in Resend
3. Daily email limit exceeded (100/day on free tier)
4. Invalid email address

Fix:
- Verify Resend API key: Check Supabase secrets
- Check Resend dashboard for logs
- Upgrade Resend plan if hitting limits

**No emails sent (processed = 0)**

Possible causes:
1. No users have `digest_enabled = true`
2. Function not being triggered

Fix:
```sql
-- Check for enabled users
SELECT COUNT(*) FROM users WHERE digest_enabled = true;

-- Should return > 0
```

**Empty digest (no homework found)**

This is normal if:
- User has no assignments due in next 7 days
- User hasn't synced any assignments yet
- Calendar events missing `canvasAssignmentId` tag

Check:
```sql
-- Get user's calendar URL for manual inspection
SELECT email FROM users WHERE id = 'USER_ID';
-- Then manually check their Google Calendar
```

## Performance

### Expected Runtime

- ~2-5 seconds per user
- With 100 users: ~3-8 minutes total

### Optimization Tips

- Function processes users sequentially (no parallelization)
- Google Calendar API has rate limits (~10 requests/second)
- Consider batching if user count exceeds 1000

## Email Format Example

```
Good morning!

━━━━━━━━━━━━━━━━━━━━
TODAY
━━━━━━━━━━━━━━━━━━━━

⚠️  [CS61B] Project 2 — due 11:59 PM
   → https://bcourses.berkeley.edu/courses/.../assignments/...

⚠️  [MATH54] Problem Set 5 — due 11:59 PM
   → https://bcourses.berkeley.edu/courses/.../assignments/...

━━━━━━━━━━━━━━━━━━━━
THIS WEEK
━━━━━━━━━━━━━━━━━━━━

Wed, Feb 14 · [EECS16A] Lab 3
Thu, Feb 15 · [CS61B] Homework 4
Fri, Feb 16 · [MATH54] Midterm 1

━━━━━━━━━━━━━━━━━━━━

Have a focused day.

—school-secretary

Unsubscribe: https://...supabase.co/functions/v1/unsubscribe?id=...
```

## Testing Edge Cases

### User with No Assignments

Expected: Email sent with "Nothing due today" and "Nothing else this week"

### User with Expired Token

Expected: Function automatically refreshes token and sends email

### User with Revoked Access

Expected: Function fails for that user, continues to next user

### Empty User Table

Expected: Response with `processed: 0, failed: 0, total: 0`

## Updating the Function

After code changes:

```bash
supabase functions deploy send-digest
```

Changes take effect immediately. No need to reschedule cron.

## Security Considerations

- ✅ Function uses service role key (auto-injected, secure)
- ✅ Refresh tokens stored encrypted in Supabase
- ✅ Access tokens cached with expiry time
- ✅ Unsubscribe links use non-guessable UUIDs
- ⚠️ Rate limit considerations for Google API (implement backoff if needed)

## Future Enhancements

Noted for later (not in MVP):

- [ ] Per-user timezone support (currently single cron time)
- [ ] Retry logic for failed emails
- [ ] Email analytics (open rates, click tracking)
- [ ] Rich HTML email template
- [ ] Configurable send time per user
- [ ] Digest preview in settings page
