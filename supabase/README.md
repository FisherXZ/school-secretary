# Supabase Setup for Morning Digest

This directory contains the Supabase backend code for the school-secretary morning digest feature.

## Directory Structure

```
supabase/
├── schema.sql           # Database schema (run this first)
├── functions/           # Edge Functions
│   ├── signup-user/     # Handles user signup
│   ├── send-digest/     # Daily cron job to send digests
│   ├── unsubscribe/     # Unsubscribe handler
│   └── settings-page/   # User settings page
└── README.md           # This file
```

## Initial Setup

### 1. Create Supabase Project

1. Go to [supabase.com](https://supabase.com) and sign in
2. Click "New Project"
3. Name it `school-secretary`
4. Choose a region close to your users
5. Set a strong database password (save this!)
6. Wait for project to provision (~2 minutes)

### 2. Run Database Schema

1. In Supabase Dashboard, go to **SQL Editor**
2. Click "New Query"
3. Copy the contents of `schema.sql`
4. Paste and click "Run"
5. Verify the `users` table was created under **Database → Tables**

### 3. Get API Keys

Go to **Settings → API** and copy:

- **Project URL** → `SUPABASE_URL`
  - Example: `https://abcdefghijklmnop.supabase.co`

- **anon public key** → `SUPABASE_ANON_KEY`
  - This goes in the Chrome extension
  - Safe to expose to client

- **service_role secret key** → `SUPABASE_SERVICE_ROLE_KEY`
  - This goes ONLY in Edge Function secrets
  - NEVER expose this in extension code
  - Has full database access, bypasses Row Level Security

### 4. Set Up Resend (Email Service)

1. Go to [resend.com](https://resend.com) and sign up
2. Create an API key → `RESEND_API_KEY`
3. Verify your domain (or use their test domain for development)
4. Free tier: 100 emails/day (sufficient for MVP)

### 5. Configure Edge Function Secrets

In Supabase Dashboard, go to **Edge Functions → Manage secrets** and add:

```bash
RESEND_API_KEY=re_xxxxxxxxxxxxx
GOOGLE_CLIENT_ID=862922347346-xxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxxxxxxx
```

> **Note:** `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` come from your existing Google OAuth setup (already in manifest.json). You'll need to generate a client secret if you don't have one.

### 6. Enable Row Level Security (Optional but Recommended)

For production, enable RLS on the users table:

```sql
-- Enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Allow service role to do everything (for Edge Functions)
CREATE POLICY "Service role has full access"
ON users
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Users can only read their own data via anon key
CREATE POLICY "Users can read own data"
ON users
FOR SELECT
TO anon
USING (email = current_setting('request.jwt.claims')::json->>'email');
```

> **For MVP:** You can skip RLS since the extension uses the anon key only for existence checks, and Edge Functions use service_role key.

## Deploying Edge Functions

See individual function directories for deployment instructions, or refer to the main deployment guide.

## Environment Variables Summary

### For Chrome Extension

Add these to your extension code (replace placeholders):

```typescript
const SUPABASE_URL = 'https://YOUR_PROJECT_REF.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';
```

### For Supabase Edge Functions

Set these as secrets in Supabase Dashboard:

```
RESEND_API_KEY=re_xxxxx
GOOGLE_CLIENT_ID=862922347346-xxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxx
```

> **Auto-injected by Supabase:**
> - `SUPABASE_URL`
> - `SUPABASE_SERVICE_ROLE_KEY`
> These are automatically available in Edge Functions, no need to set them manually.

## Testing Database Setup

Run this query in SQL Editor to verify:

```sql
-- Should return empty result (no users yet)
SELECT * FROM users;

-- Should return the table structure
SELECT
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'users';
```

## Next Steps

After completing this setup:

1. Deploy Edge Functions (see deployment guide)
2. Update Chrome extension with Supabase credentials
3. Test signup flow
4. Configure cron job for daily digest

## Troubleshooting

### "relation 'users' does not exist"

- Make sure you ran `schema.sql` in SQL Editor
- Check **Database → Tables** to verify table was created

### "JWT expired" or auth errors in Edge Functions

- Service role key never expires, so this shouldn't happen
- If you see this, regenerate keys in **Settings → API**

### Email not sending

- Check Resend API key is correct
- Verify domain is verified in Resend dashboard
- Check Supabase Edge Function logs: **Edge Functions → [function name] → Logs**

### "Failed to fetch" errors in extension

- Make sure `SUPABASE_URL` is correct (no trailing slash)
- Check browser console for CORS errors
- Verify anon key is correctly set
