# Morning Digest Deployment Guide

Complete step-by-step guide to deploy Layer 2 (Morning Digest) feature.

## Overview

This guide will walk you through deploying the complete morning digest system:
- Supabase backend (database + Edge Functions)
- Chrome extension updates
- Email delivery via Resend
- Daily cron job configuration

**Estimated time:** 30-45 minutes

---

## Prerequisites

Before starting, ensure you have:

- [ ] Chrome extension already deployed (Layer 1)
- [ ] Google OAuth credentials (already in manifest.json)
- [ ] Google Cloud Console access to generate client secret
- [ ] Domain for email sending (or use Resend test domain)
- [ ] Basic familiarity with terminal/command line

---

## Step 1: Supabase Setup (10 minutes)

### 1.1 Create Supabase Project

1. Go to [supabase.com](https://supabase.com) and sign in
2. Click **"New Project"**
3. Fill in details:
   - **Name:** `school-secretary`
   - **Database Password:** Generate strong password (save this!)
   - **Region:** Choose closest to your users (e.g., US West)
   - **Pricing Plan:** Free tier is sufficient for MVP
4. Click **"Create new project"**
5. Wait ~2 minutes for provisioning

### 1.2 Deploy Database Schema

1. In Supabase Dashboard, go to **SQL Editor**
2. Click **"New Query"**
3. Open `supabase/schema.sql` from this repo
4. Copy entire contents and paste into SQL Editor
5. Click **"Run"** (or press Cmd/Ctrl + Enter)
6. Verify success: Go to **Database → Tables** → Should see `users` table

### 1.3 Get API Keys

1. Go to **Settings → API**
2. Copy these three values (you'll need them later):

   ```
   Project URL: https://abcdefghij.supabase.co
   anon public key: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   service_role key: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   ```

3. Save these to a secure location (password manager recommended)

**Security note:**
- `anon` key: Safe to expose in extension code
- `service_role` key: NEVER expose in extension, only use in Edge Functions

---

## Step 2: Resend Setup (5 minutes)

### 2.1 Create Resend Account

1. Go to [resend.com](https://resend.com)
2. Sign up (free tier: 100 emails/day, 3,000/month)
3. Verify your email address

### 2.2 Get API Key

1. In Resend dashboard, go to **API Keys**
2. Click **"Create API Key"**
3. Name it `school-secretary-production`
4. Copy the key: `re_xxxxxxxxxxxxx`
5. Save this securely

### 2.3 Configure Email Domain

**Option A: Use Test Domain (Recommended for Development)**
- Resend provides `onboarding@resend.dev` for testing
- No configuration needed
- Emails may go to spam
- Update `from` field in Edge Functions to: `school-secretary <onboarding@resend.dev>`

**Option B: Use Your Own Domain (Recommended for Production)**
1. Go to **Domains** in Resend dashboard
2. Click **"Add Domain"**
3. Enter your domain (e.g., `schoolsecretary.com`)
4. Add DNS records as shown (TXT, CNAME, MX)
5. Wait for verification (5-30 minutes)
6. Update `from` field in Edge Functions to: `school-secretary <digest@yourdomain.com>`

---

## Step 3: Google OAuth Setup (5 minutes)

### 3.1 Get Client Secret

Your extension already has a Client ID in `manifest.json`. Now you need the client secret.

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Navigate to **APIs & Services → Credentials**
3. Find your OAuth 2.0 Client ID (should match the one in manifest.json)
4. Click on it to view details
5. Copy the **Client Secret**: `GOCSPX-xxxxxxxxxxxxx`
6. Save this securely

**If you don't have OAuth credentials yet:**
1. Create a new OAuth 2.0 Client ID
2. Application type: **Chrome Extension**
3. Add the Chrome extension ID
4. Add scopes:
   - `https://www.googleapis.com/auth/calendar.events`
   - `https://www.googleapis.com/auth/userinfo.email`
   - `https://www.googleapis.com/auth/calendar.settings.readonly`

---

## Step 4: Configure Environment Secrets (5 minutes)

### 4.1 Set Secrets in Supabase

1. In Supabase Dashboard, go to **Edge Functions**
2. Click **"Manage secrets"**
3. Add these three secrets:

   ```bash
   RESEND_API_KEY=re_xxxxxxxxxxxxx
   GOOGLE_CLIENT_ID=862922347346-xxxxx.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxxxxxxx
   ```

4. Click **"Save"**

**Note:** `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are automatically available in Edge Functions.

---

## Step 5: Deploy Edge Functions (10 minutes)

### 5.1 Install Supabase CLI

**macOS:**
```bash
brew install supabase/tap/supabase
```

**Windows (via Scoop):**
```bash
scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
scoop install supabase
```

**Linux:**
```bash
brew install supabase/tap/supabase
```

**Or via npm (any platform):**
```bash
npm install -g supabase
```

Verify installation:
```bash
supabase --version
```

### 5.2 Login to Supabase

```bash
supabase login
```

This opens a browser window to authenticate. Click **"Authorize"**.

### 5.3 Link to Your Project

Get your project reference ID from Supabase Dashboard URL:
`https://app.supabase.com/project/YOUR_PROJECT_REF`

Then link:
```bash
cd /path/to/school-secretary
supabase link --project-ref YOUR_PROJECT_REF
```

Enter your database password when prompted.

### 5.4 Deploy All Functions

```bash
cd supabase/functions
supabase functions deploy signup-user
supabase functions deploy send-digest
supabase functions deploy unsubscribe
supabase functions deploy settings-page
```

Or deploy all at once (bash):
```bash
for func in signup-user send-digest unsubscribe settings-page; do
  supabase functions deploy $func
done
```

Expected output for each:
```
Deploying Function (project-ref: YOUR_PROJECT_REF)...
Function 'signup-user' deployed successfully!
```

### 5.5 Verify Deployment

```bash
supabase functions list
```

Should show all four functions with status "ACTIVE".

---

## Step 6: Update Chrome Extension (5 minutes)

### 6.1 Update Supabase Credentials

Open `src/popup/popup.ts` and update these lines (around line 28-31):

```typescript
// OLD:
const SUPABASE_URL = 'YOUR_SUPABASE_URL';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';

// NEW (use your actual values):
const SUPABASE_URL = 'https://abcdefghij.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';
```

### 6.2 Update Email Domain (if using custom domain)

If you set up your own domain in Resend:

1. Open `supabase/functions/signup-user/index.ts`
2. Find line ~110: `from: 'school-secretary <digest@yourdomain.com>'`
3. Replace `yourdomain.com` with your actual domain
4. Open `supabase/functions/send-digest/index.ts`
5. Find line ~245: `from: 'school-secretary <digest@yourdomain.com>'`
6. Replace `yourdomain.com` with your actual domain
7. Redeploy both functions:
   ```bash
   supabase functions deploy signup-user
   supabase functions deploy send-digest
   ```

### 6.3 Rebuild Extension

```bash
npm run build
```

### 6.4 Reload Extension in Chrome

1. Go to `chrome://extensions/`
2. Find "Canvas Calendar Sync"
3. Click the **refresh icon** ↻
4. Extension is now updated

---

## Step 7: Test the System (10 minutes)

### 7.1 Test Signup Flow

1. Open the Chrome extension
2. If not connected, click **"Connect Google Calendar"**
3. You should see the **"Morning Digest"** card
4. Enter your email and click **"Enable Digest"**
5. Check your email for the welcome message

**Expected welcome email:**
```
Subject: Tomorrow morning, we've got you

Hey!

You're all set. Starting tomorrow at 8am, you'll wake up to a simple
rundown of what's due — today and this week.

No more checking five tabs. No more "wait, when was that due?"

We'll see you in the morning.

—school-secretary
```

### 7.2 Verify Database Entry

In Supabase Dashboard:
1. Go to **Database → Table Editor**
2. Select `users` table
3. You should see your email with `digest_enabled = true`

### 7.3 Test Send Digest (Manually)

**Important:** This will send a real email to all users with `digest_enabled = true`.

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

Check your email for the digest.

### 7.4 Test Settings Page

1. In the extension, click **"Digest settings"**
2. Should open a new tab with your settings
3. Toggle should show "On"
4. Click **"Turn Off Digest"**
5. Verify status changes to "Off"
6. Click **"Turn On Digest"** to re-enable

### 7.5 Test Unsubscribe

Check the digest email you received and click the unsubscribe link at the bottom.

Expected: Confirmation page showing "You've been unsubscribed"

---

## Step 8: Set Up Daily Cron (5 minutes)

### 8.1 Enable pg_cron Extension

1. In Supabase Dashboard, go to **Database → Extensions**
2. Search for `pg_cron`
3. Click **"Enable"**

### 8.2 Schedule the Job

1. Go to **SQL Editor**
2. Click **"New Query"**
3. Paste the following (adjust timezone as needed):

```sql
-- Schedule digest to run at 8am PST (4pm UTC)
SELECT cron.schedule(
  'send-morning-digest',
  '0 16 * * *',
  $$
  SELECT net.http_post(
    url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-digest',
    headers := '{"Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
  );
  $$
);
```

**Timezone Reference:**
- **PST (UTC-8):** 8am PST = 4pm UTC → `'0 16 * * *'`
- **EST (UTC-5):** 8am EST = 1pm UTC → `'0 13 * * *'`
- **CST (UTC-6):** 8am CST = 2pm UTC → `'0 14 * * *'`

Replace:
- `YOUR_PROJECT_REF` with your actual project ref
- `YOUR_SERVICE_ROLE_KEY` with your actual service role key

4. Click **"Run"**

### 8.3 Verify Cron Setup

```sql
-- View cron jobs
SELECT * FROM cron.job;

-- Should show:
-- jobid | schedule    | command
-- 1     | 0 16 * * *  | SELECT net.http_post(...)
```

---

## Step 9: Monitor and Maintain

### View Function Logs

**In Dashboard:**
1. Go to **Edge Functions**
2. Click function name
3. Click **"Logs"** tab

**Via CLI:**
```bash
supabase functions logs send-digest --follow
```

### View Cron Run History

```sql
SELECT
  status,
  start_time,
  return_message
FROM cron.job_run_details
WHERE job_id = (SELECT jobid FROM cron.job WHERE jobname = 'send-morning-digest')
ORDER BY start_time DESC
LIMIT 10;
```

### Monitor Email Delivery

1. Go to Resend Dashboard
2. Check **"Logs"** for delivery status
3. View open rates, bounces, etc.

---

## Troubleshooting

### "Supabase credentials not configured"

You forgot to update `SUPABASE_URL` and `SUPABASE_ANON_KEY` in `src/popup/popup.ts`.

Fix: Update the values and run `npm run build` then reload extension.

### "Failed to enable digest"

Check browser console for errors. Common causes:
- Invalid Supabase credentials
- Network/CORS issues
- Edge function not deployed

Fix: Verify all credentials and redeploy functions.

### "Token refresh failed" in send-digest logs

User revoked Google Calendar access or refresh token is invalid.

Fix: User needs to disconnect and reconnect in extension.

### No email received

Check:
1. Resend API key is correct (Supabase Dashboard → Edge Functions → Manage secrets)
2. Domain is verified in Resend (if using custom domain)
3. Email not in spam folder
4. Resend logs for delivery errors

### Cron job not running

Check:
1. `pg_cron` extension is enabled
2. Cron job exists: `SELECT * FROM cron.job;`
3. View run history: `SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;`
4. Function URL and authorization are correct

### User doesn't see digest section in extension

Check:
1. User successfully connected Google Calendar
2. Extension was rebuilt after updating Supabase credentials
3. Extension was reloaded in Chrome
4. No console errors in extension popup

---

## Success Checklist

Layer 2 is fully deployed when:

- [x] Database schema created in Supabase
- [x] All four Edge Functions deployed
- [x] Extension updated with Supabase credentials
- [x] Test user can sign up for digest
- [x] Welcome email received
- [x] Manual digest trigger works
- [x] Settings page accessible and functional
- [x] Unsubscribe link works
- [x] Daily cron job scheduled and verified

---

## Next Steps

Once deployed:

1. **Monitor first few days:** Check cron logs and Resend logs daily
2. **Gather feedback:** Ask users if emails are helpful
3. **Adjust timing:** If 8am isn't optimal, update cron schedule
4. **Scale gradually:** Resend free tier supports 100 emails/day

## Future Enhancements

Not in MVP, noted for later:

- [ ] Per-user configurable send time
- [ ] HTML email templates with styling
- [ ] SMS notifications
- [ ] Digest preview in settings
- [ ] Weekly summary option
- [ ] Assignment priority/difficulty indicators

---

## Getting Help

If stuck:

1. Check function logs: `supabase functions logs [function-name] --follow`
2. Check Supabase Dashboard → Edge Functions → Logs
3. Check Resend Dashboard → Logs
4. Check browser console for extension errors
5. Review individual function README files in `supabase/functions/`

Common log locations:
- **Extension errors:** Browser DevTools → Console (while popup open)
- **Edge Function errors:** Supabase Dashboard → Edge Functions → Logs
- **Email delivery:** Resend Dashboard → Logs
- **Cron job history:** `SELECT * FROM cron.job_run_details ORDER BY start_time DESC;`

---

**Deployment complete!** 🎉

Users will now receive daily 8am digests with their Canvas homework.
