# Supabase Edge Functions

This directory contains the Edge Functions for the school-secretary morning digest feature.

## Functions Overview

| Function | Purpose | Trigger |
|----------|---------|---------|
| `signup-user` | Creates or updates user subscription | Called from Chrome extension |
| `send-digest` | Sends daily digest emails | Daily cron job (8am) |
| `unsubscribe` | Handles email unsubscribe | Clicked from email link |
| `settings-page` | User settings interface | Opened from extension |

## Prerequisites

Before deploying, ensure you have:

1. ✅ Supabase project created
2. ✅ Database schema deployed (see `/supabase/schema.sql`)
3. ✅ Environment secrets configured (see below)
4. ✅ Supabase CLI installed

## Installing Supabase CLI

```bash
# macOS
brew install supabase/tap/supabase

# Windows (via Scoop)
scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
scoop install supabase

# Linux
brew install supabase/tap/supabase

# Or via npm (any platform)
npm install -g supabase
```

## Environment Secrets

Set these in Supabase Dashboard → **Edge Functions → Manage secrets**:

```bash
RESEND_API_KEY=re_xxxxxxxxxxxxx
GOOGLE_CLIENT_ID=862922347346-xxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxxxxxxx
```

Or via CLI:

```bash
supabase secrets set RESEND_API_KEY=re_xxxxx
supabase secrets set GOOGLE_CLIENT_ID=862922347346-xxxxx.apps.googleusercontent.com
supabase secrets set GOOGLE_CLIENT_SECRET=GOCSPX-xxxxx
```

> **Note:** `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are automatically injected.

## Deployment

### 1. Login to Supabase

```bash
supabase login
```

This will open a browser window to authenticate.

### 2. Link to Your Project

```bash
supabase link --project-ref YOUR_PROJECT_REF
```

Get your project ref from the Supabase dashboard URL:
`https://app.supabase.com/project/YOUR_PROJECT_REF`

### 3. Deploy Functions

Deploy all functions:

```bash
supabase functions deploy signup-user
supabase functions deploy send-digest
supabase functions deploy unsubscribe
supabase functions deploy settings-page
```

Or deploy all at once:

```bash
for func in signup-user send-digest unsubscribe settings-page; do
  supabase functions deploy $func
done
```

### 4. Verify Deployment

Check function logs in Supabase Dashboard:
- Go to **Edge Functions**
- Click on a function name
- View **Logs** tab

Or via CLI:

```bash
supabase functions logs signup-user --follow
```

## Testing Functions

### Test signup-user

```bash
curl -X POST https://YOUR_PROJECT_REF.supabase.co/functions/v1/signup-user \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "google_refresh_token": "test_token",
    "timezone": "America/Los_Angeles"
  }'
```

### Test send-digest (manually trigger)

```bash
curl -X POST https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-digest \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY"
```

### Test unsubscribe

Open in browser:
```
https://YOUR_PROJECT_REF.supabase.co/functions/v1/unsubscribe?id=USER_UUID
```

### Test settings-page

Open in browser:
```
https://YOUR_PROJECT_REF.supabase.co/functions/v1/settings-page?id=USER_UUID
```

## Setting Up Cron Job

After deploying `send-digest`, set up the daily cron job:

1. Go to Supabase Dashboard → **Database → Extensions**
2. Enable `pg_cron` extension
3. Go to **SQL Editor** and run:

```sql
-- Schedule digest to run at 8am PST (4pm UTC)
-- Adjust time based on your primary user timezone
SELECT cron.schedule(
  'send-morning-digest',
  '0 16 * * *',  -- 4pm UTC = 8am PST (UTC-8)
  $$
  SELECT net.http_post(
    url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-digest',
    headers := '{"Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
  );
  $$
);
```

### Verify Cron Job

```sql
-- List all cron jobs
SELECT * FROM cron.job;

-- View cron job run history
SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;
```

### Update Cron Schedule

```sql
-- Unschedule old job
SELECT cron.unschedule('send-morning-digest');

-- Schedule new time
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

## Updating Functions

To update a function after code changes:

```bash
# Make your changes to the function code
# Then redeploy
supabase functions deploy signup-user
```

Changes are live immediately (no downtime).

## Debugging

### View Logs

Dashboard:
- **Edge Functions → [function name] → Logs**

CLI:
```bash
supabase functions logs signup-user --follow
```

### Common Issues

**"Missing environment variable"**
- Check secrets are set: `supabase secrets list`
- Redeploy function after setting secrets

**"Database error: relation does not exist"**
- Verify schema.sql was run
- Check table name spelling

**"Failed to fetch"**
- Check CORS headers in function
- Verify URL is correct
- Check browser console for errors

**Cron job not running**
- Verify `pg_cron` extension is enabled
- Check cron job exists: `SELECT * FROM cron.job;`
- View run history: `SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;`

## Development Workflow

1. Make code changes locally
2. Deploy function: `supabase functions deploy [name]`
3. Test via curl or browser
4. Check logs: `supabase functions logs [name]`
5. Repeat until working

## Function URLs

After deployment, your functions are available at:

```
https://YOUR_PROJECT_REF.supabase.co/functions/v1/signup-user
https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-digest
https://YOUR_PROJECT_REF.supabase.co/functions/v1/unsubscribe
https://YOUR_PROJECT_REF.supabase.co/functions/v1/settings-page
```

Update these URLs in your Chrome extension's `popup.ts`.

## Security Notes

- ⚠️ Never expose `SUPABASE_SERVICE_ROLE_KEY` in client code
- ✅ Use `SUPABASE_ANON_KEY` in Chrome extension
- ✅ Edge Functions use service role key (auto-injected)
- ✅ All functions validate input before processing
- ✅ Unsubscribe links use non-guessable UUIDs

## Next Steps

After deploying functions:

1. Update Chrome extension with Supabase URL and anon key
2. Test signup flow end-to-end
3. Manually trigger send-digest to test email delivery
4. Set up cron job for daily digests
5. Monitor logs for errors
