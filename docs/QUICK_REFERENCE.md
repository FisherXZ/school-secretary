# Morning Digest Quick Reference

Fast lookup guide for common tasks.

## URLs

```bash
# Supabase Dashboard
https://app.supabase.com/project/YOUR_PROJECT_REF

# Edge Functions
https://YOUR_PROJECT_REF.supabase.co/functions/v1/signup-user
https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-digest
https://YOUR_PROJECT_REF.supabase.co/functions/v1/unsubscribe
https://YOUR_PROJECT_REF.supabase.co/functions/v1/settings-page

# Resend Dashboard
https://resend.com/dashboard

# Google Cloud Console
https://console.cloud.google.com/apis/credentials
```

## Environment Variables

### Supabase Edge Functions

Set in Dashboard → Edge Functions → Manage secrets:

```bash
RESEND_API_KEY=re_xxxxxxxxxxxxx
GOOGLE_CLIENT_ID=862922347346-xxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxxxxxxx
```

### Chrome Extension

Update in `src/popup/popup.ts`:

```typescript
const SUPABASE_URL = 'https://YOUR_PROJECT_REF.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';
```

## Common Commands

### Deploy Functions

```bash
# Deploy single function
supabase functions deploy signup-user

# Deploy all functions
for func in signup-user send-digest unsubscribe settings-page; do
  supabase functions deploy $func
done
```

### View Logs

```bash
# Real-time logs
supabase functions logs send-digest --follow

# Last 100 lines
supabase functions logs send-digest --limit 100
```

### Test Functions

```bash
# Test signup (replace values)
curl -X POST https://YOUR_PROJECT_REF.supabase.co/functions/v1/signup-user \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","google_refresh_token":"token","timezone":"America/Los_Angeles"}'

# Manually trigger digest (replace values)
curl -X POST https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-digest \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY"
```

### Database Queries

```sql
-- View all users
SELECT * FROM users;

-- Count enabled users
SELECT COUNT(*) FROM users WHERE digest_enabled = true;

-- View cron jobs
SELECT * FROM cron.job;

-- View cron run history
SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;

-- Disable all users (for testing)
UPDATE users SET digest_enabled = false;

-- Enable specific user
UPDATE users SET digest_enabled = true WHERE email = 'user@example.com';

-- Delete test user
DELETE FROM users WHERE email = 'test@example.com';
```

## Cron Schedule

### Schedule Digest

```sql
SELECT cron.schedule(
  'send-morning-digest',
  '0 16 * * *',  -- 4pm UTC = 8am PST
  $$
  SELECT net.http_post(
    url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-digest',
    headers := '{"Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
  );
  $$
);
```

### Update Schedule

```sql
-- Remove old schedule
SELECT cron.unschedule('send-morning-digest');

-- Add new schedule
SELECT cron.schedule(
  'send-morning-digest',
  '0 15 * * *',  -- New time: 3pm UTC = 7am PST
  $$
  SELECT net.http_post(
    url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-digest',
    headers := '{"Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
  );
  $$
);
```

### Timezone Reference

| Local Time | Timezone | UTC Offset | UTC Time | Cron Expression |
|------------|----------|------------|----------|-----------------|
| 8am PST    | Pacific  | UTC-8      | 4pm      | `0 16 * * *`    |
| 8am EST    | Eastern  | UTC-5      | 1pm      | `0 13 * * *`    |
| 8am CST    | Central  | UTC-6      | 2pm      | `0 14 * * *`    |
| 8am GMT    | London   | UTC+0      | 8am      | `0 8 * * *`     |

## Troubleshooting

### Check Function Deployment

```bash
supabase functions list
```

Expected output:
```
signup-user    ACTIVE
send-digest    ACTIVE
unsubscribe    ACTIVE
settings-page  ACTIVE
```

### Verify Database Schema

```sql
-- Check if users table exists
SELECT * FROM information_schema.tables WHERE table_name = 'users';

-- Check table structure
SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'users';
```

### Check Environment Secrets

```bash
supabase secrets list
```

Expected:
```
RESEND_API_KEY
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
```

### Test Email Delivery

1. Go to Resend Dashboard → Logs
2. Filter by recipient email
3. Check delivery status

### Debug Extension

1. Open Chrome extension popup
2. Right-click → Inspect
3. Check Console for errors
4. Check Network tab for failed requests

## File Locations

```
school-secretary/
├── docs/
│   ├── MORNING_DIGEST_DEPLOYMENT.md    # Full deployment guide
│   ├── MORNING_DIGEST_ARCHITECTURE.md  # Technical architecture
│   └── QUICK_REFERENCE.md              # This file
├── supabase/
│   ├── schema.sql                      # Database schema
│   ├── README.md                       # Setup guide
│   ├── .env.example                    # Environment template
│   └── functions/
│       ├── README.md                   # Functions deployment
│       ├── signup-user/index.ts
│       ├── send-digest/
│       │   ├── index.ts
│       │   └── README.md               # Detailed function docs
│       ├── unsubscribe/index.ts
│       └── settings-page/index.ts
└── src/
    └── popup/
        ├── popup.html                  # UI with digest section
        ├── popup.ts                    # Digest logic
        └── popup.css                   # Digest styles
```

## Support Contacts

- **Supabase Issues:** https://github.com/supabase/supabase/issues
- **Resend Support:** support@resend.com
- **Google Calendar API:** https://developers.google.com/calendar/api/v3/reference

## Quick Checks

### Is digest working?

```bash
# 1. Check users exist
psql -c "SELECT COUNT(*) FROM users WHERE digest_enabled = true;"

# 2. Check cron is scheduled
psql -c "SELECT * FROM cron.job WHERE jobname = 'send-morning-digest';"

# 3. Check recent cron runs
psql -c "SELECT status, start_time FROM cron.job_run_details ORDER BY start_time DESC LIMIT 5;"

# 4. Manually trigger
curl -X POST https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-digest \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY"

# 5. Check Resend logs
# Go to https://resend.com/dashboard → Logs
```

### User reports not receiving emails

```sql
-- Check if user exists and is enabled
SELECT * FROM users WHERE email = 'user@example.com';

-- Check if user's token is valid
SELECT email, token_expires_at FROM users WHERE email = 'user@example.com';

-- If token expired, user needs to reconnect in extension
```

### Emails going to spam

1. Verify domain in Resend (if using custom domain)
2. Check SPF/DKIM records in DNS
3. Ask users to mark as "Not Spam"
4. Consider adding unsubscribe link to header (already in footer)

## Maintenance Tasks

### Weekly

- [ ] Check Resend delivery rate (should be >98%)
- [ ] Check cron job success rate (`SELECT * FROM cron.job_run_details`)
- [ ] Review function logs for errors

### Monthly

- [ ] Check Resend quota usage (free tier: 100/day)
- [ ] Check Supabase storage usage
- [ ] Review user growth trends

### As Needed

- [ ] Update email copy (redeploy signup-user, send-digest)
- [ ] Adjust cron time (unschedule + reschedule)
- [ ] Scale up Resend plan if hitting limits

## Emergency Procedures

### Stop All Digests

```sql
-- Disable all users
UPDATE users SET digest_enabled = false;

-- Or unschedule cron
SELECT cron.unschedule('send-morning-digest');
```

### Resume Digests

```sql
-- Re-enable users
UPDATE users SET digest_enabled = true;

-- Or reschedule cron (if unscheduled)
-- See "Cron Schedule" section above
```

### Rollback Function

```bash
# Deploy previous version (if you have it)
supabase functions deploy send-digest
```

---

**Keep this doc handy for quick troubleshooting!**
