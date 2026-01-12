# Morning Digest Testing Checklist

## Current Status
✅ Database schema deployed
✅ All Edge Functions deployed (signup-user, send-digest, unsubscribe, settings-page)
✅ Extension rebuilt with settings page 401 fix
✅ Source-of-truth database sync implemented
✅ Two-step unsubscribe confirmation implemented

## Immediate Next Steps

### 1. Reload Extension (Required)
The extension was just rebuilt with the settings page fix. You must reload it:

1. Open Chrome and go to `chrome://extensions/`
2. Find "Canvas Calendar Sync"
3. Click the refresh/reload icon
4. Verify no errors appear

### 2. Test Settings Page Fix
This was the last issue we fixed - verify it now works:

1. Open the extension popup
2. If "Enable Digest" button is shown, click it first to sign up
3. Click "Digest Settings" button
4. **Expected**: Settings page loads with toggle switch
5. **Previous error**: 401 "Missing authorization header"
6. **If it works**: Toggle the switch and verify it updates

### 3. Set Up Cron Job (Critical - Not Done Yet)
The digest won't run automatically until you set up the cron job:

1. Go to Supabase Dashboard → SQL Editor
2. Run this query (replace YOUR_PROJECT_REF and YOUR_SERVICE_ROLE_KEY):

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

3. Verify cron job was created:
```sql
SELECT * FROM cron.job WHERE jobname = 'send-morning-digest';
```

**Find your credentials:**
- Project Ref: In Supabase Dashboard URL (e.g., `nquiewtbiopbsgfzpcrt`)
- Service Role Key: Dashboard → Settings → API → service_role key

### 4. Manual Digest Test (Verify End-to-End)
Test the digest before waiting for tomorrow morning:

```bash
curl -X POST https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-digest \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY"
```

**What should happen:**
1. Function fetches all users where digest_enabled = true
2. For each user, refreshes Google access token if needed
3. Fetches events from user's primary Google Calendar
4. Filters for Canvas assignments (summary contains "Canvas:")
5. Groups into "Due Today" and "Due This Week"
6. Sends email via Resend
7. Logs success/failure

**Check results:**
- Supabase logs: Dashboard → Edge Functions → send-digest → Logs
- Resend logs: https://resend.com/dashboard → Logs
- Your email inbox

---

## Comprehensive Testing Matrix

### Extension Tests

#### Calendar Sync (Layer 1 - Already Working)
- [ ] Navigate to Canvas course page
- [ ] Click extension icon
- [ ] Click "Connect Google Calendar"
- [ ] Verify OAuth flow completes
- [ ] Click "Sync Assignments to Calendar"
- [ ] Verify assignments appear in Google Calendar
- [ ] Verify event details (title, description, due date)

#### Digest Signup (Layer 2 - New Feature)
- [ ] Click extension icon
- [ ] See "Enable Digest" button
- [ ] Click "Enable Digest"
- [ ] Verify success message appears
- [ ] Verify button changes to "Digest Settings"
- [ ] Verify email address shown

#### Database Sync (Source of Truth)
- [ ] Enable digest in extension
- [ ] Open extension popup again (close and reopen)
- [ ] Verify digest status persists (doesn't flash or change)
- [ ] Go to Supabase → Table Editor → users
- [ ] Disable digest in database: `UPDATE users SET digest_enabled = false WHERE email = 'your@email.com'`
- [ ] Refresh extension popup
- [ ] Verify button changes back to "Enable Digest"
- [ ] Re-enable via extension
- [ ] Verify database updates: `SELECT * FROM users WHERE email = 'your@email.com'`

### Settings Page Tests

#### Load Settings Page
- [ ] Click "Digest Settings" from extension
- [ ] Verify page loads (not 401 error)
- [ ] Verify email address displayed
- [ ] Verify timezone displayed
- [ ] Verify toggle switch state matches database

#### Toggle Digest On/Off
- [ ] Toggle switch to OFF
- [ ] Wait 2 seconds for auto-save
- [ ] Verify success message
- [ ] Check database: digest_enabled should be false
- [ ] Refresh page
- [ ] Verify toggle stayed OFF
- [ ] Toggle back to ON
- [ ] Verify database updated to true

#### Settings Page Without User ID
- [ ] Copy settings page URL
- [ ] Remove `id=xxx` parameter from URL
- [ ] Load page
- [ ] Verify shows "Invalid user ID" error

### Unsubscribe Tests

#### Unsubscribe Link (From Email)
- [ ] Get unsubscribe URL from email footer
- [ ] Format: `https://xxx.supabase.co/functions/v1/unsubscribe?id={USER_ID}`
- [ ] Click link
- [ ] **Step 1**: Verify confirmation page loads with:
  - Heading: "Unsubscribe from morning digest?"
  - Two buttons: "Yes, unsubscribe" and "Cancel"
- [ ] Click "Cancel"
- [ ] Verify nothing changed in database
- [ ] Click unsubscribe link again
- [ ] **Step 2**: Click "Yes, unsubscribe"
- [ ] Verify success page: "You've been unsubscribed"
- [ ] Check database: digest_enabled should be false
- [ ] Verify updated_at timestamp changed

#### Invalid Unsubscribe Links
- [ ] Try URL with missing ID: `.../unsubscribe`
- [ ] Verify error: "Invalid unsubscribe link. Missing user ID."
- [ ] Try URL with malformed UUID: `.../unsubscribe?id=not-a-uuid`
- [ ] Verify error: "Invalid user ID format."
- [ ] Try URL with random UUID: `.../unsubscribe?id=00000000-0000-0000-0000-000000000000`
- [ ] Verify either error or confirmation page (won't actually unsubscribe non-existent user)

### Email Content Tests

#### Welcome Email (signup-user function)
- [ ] Sign up for digest via extension
- [ ] Check inbox for welcome email
- [ ] Verify subject: "Welcome to school-secretary morning digest!"
- [ ] Verify content includes:
  - "You're signed up to receive daily homework emails at 8am"
  - Link to settings page
  - Unsubscribe link in footer

#### Digest Email Format (send-digest function)
- [ ] Trigger manual digest via curl
- [ ] Check inbox for digest email
- [ ] Verify subject: "📬 Homework due today (Wed Jan 15)" (date varies)
- [ ] Verify content structure:
  - "📝 Due today (Wednesday, January 15, 2026)" section
  - List of assignments due today
  - "📅 Due this week" section
  - List of assignments due within 7 days
  - Settings link
  - Unsubscribe link
- [ ] Verify each assignment includes:
  - Assignment name
  - Course name (if available)
  - Due date/time
  - Link to Canvas assignment

#### Edge Cases
- [ ] No assignments due today or this week
  - Verify email body says "No assignments due today" or similar
- [ ] Only assignments due today (none for rest of week)
  - Verify "Due this week" section is empty or omitted
- [ ] Assignments without due dates
  - Verify they're excluded (per MVP decision)

### Token Management Tests

#### Access Token Refresh
- [ ] Sign up user with digest enabled
- [ ] Wait 1 hour (access token expires)
- [ ] Trigger manual digest
- [ ] Check send-digest logs
- [ ] Verify log shows token refresh: "Refreshing access token for user..."
- [ ] Check database: token_expires_at should be updated to future time
- [ ] Verify email still sent successfully

#### Expired Refresh Token
- [ ] Manually corrupt refresh token in database
- [ ] Trigger manual digest
- [ ] Check logs: should show error for that user
- [ ] Verify other users still get emails
- [ ] Verify user gets skipped gracefully (no crash)

### Cron Job Tests

#### Verify Cron Scheduled
- [ ] Run: `SELECT * FROM cron.job WHERE jobname = 'send-morning-digest';`
- [ ] Verify schedule is '0 16 * * *' (or your chosen time)
- [ ] Verify active = true

#### View Cron Run History
- [ ] Wait for cron to run (or change schedule to next minute for testing)
- [ ] Run: `SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 5;`
- [ ] Verify cron ran
- [ ] Check status (should be 'succeeded')
- [ ] Check return_message for any errors

#### Manual Cron Trigger
- [ ] Before 8am PST, manually trigger digest
- [ ] Verify emails sent
- [ ] Check Resend dashboard for delivery confirmation
- [ ] Check inbox

### Timezone Tests (Current MVP: PST Only)

#### PST User
- [ ] Sign up with timezone 'America/Los_Angeles'
- [ ] Verify digest sent at 8am PST (4pm UTC)
- [ ] Verify "Due today" section shows assignments due on PST date

#### Non-PST User (Expected Behavior)
- [ ] Sign up with timezone 'America/New_York'
- [ ] Verify digest still sent at 8am PST (11am EST for them)
- [ ] Verify "Due today" section shows assignments due on EST date (correct per user's timezone)
- [ ] **Note**: Send time not optimal for them, but date grouping correct

### Error Handling Tests

#### Database Connection Failure
- [ ] (Cannot easily test without breaking production)
- [ ] Review send-digest logs for any connection errors

#### Resend API Failure
- [ ] (Cannot easily test)
- [ ] Check send-digest code: verify errors are caught and logged
- [ ] Verify one user's email failure doesn't stop processing other users

#### Google Calendar API Failure
- [ ] Revoke Google Calendar access for your account
- [ ] Trigger manual digest
- [ ] Verify error logged but doesn't crash function
- [ ] Verify other users still processed

#### Malformed Assignment Data
- [ ] Create Canvas assignment with missing due date
- [ ] Verify it's excluded from digest (per MVP)
- [ ] Create assignment with unusual characters in title
- [ ] Verify it renders correctly in email

### Performance Tests

#### Multiple Users
- [ ] Sign up 5+ test users
- [ ] Trigger manual digest
- [ ] Check logs: verify all processed
- [ ] Verify all emails sent (check Resend dashboard)
- [ ] Verify processing time is reasonable (<30 seconds for 5 users)

#### Large Calendar
- [ ] Create Google Calendar with 50+ events
- [ ] Trigger digest
- [ ] Verify only Canvas assignments included
- [ ] Verify email not too large (reasonable list size)

### Security Tests

#### Unauthorized Access
- [ ] Try calling send-digest without Authorization header
- [ ] Verify 401 error
- [ ] Try calling with invalid token
- [ ] Verify 401 error

#### SQL Injection (Paranoid Testing)
- [ ] Try signing up with email: `test@example.com'; DROP TABLE users; --`
- [ ] Verify user created normally
- [ ] Verify users table still exists

#### XSS in Email (Paranoid Testing)
- [ ] Create Canvas assignment with title: `<script>alert('xss')</script>`
- [ ] Trigger digest
- [ ] Verify email renders as plain text (script tags visible, not executed)

---

## Post-Launch Monitoring

### Daily Checks (First Week)
- [ ] Check cron.job_run_details for failures
- [ ] Check Resend dashboard for bounce rate (<2%)
- [ ] Check send-digest logs for errors
- [ ] Verify no users complaining about spam

### Weekly Checks (First Month)
- [ ] Review user growth: `SELECT COUNT(*) FROM users WHERE digest_enabled = true;`
- [ ] Review unsubscribe rate: `SELECT COUNT(*) FROM users WHERE digest_enabled = false;`
- [ ] Check Resend quota usage (free tier: 100 emails/day)
- [ ] Review any support tickets or user feedback

### Monthly Checks (Ongoing)
- [ ] Review token refresh failure rate
- [ ] Check for any database performance issues
- [ ] Review email delivery success rate (should be >98%)
- [ ] Consider implementing features from todo.md (structured logging, alerts, etc.)

---

## Known Limitations (MVP)

1. **Single timezone**: All digests sent at 8am PST, regardless of user timezone (date grouping is correct per user)
2. **No assignments without due dates**: These are excluded from sync and digest
3. **Access token workaround**: Using access token instead of proper refresh token from chrome.identity.launchWebAuthFlow()
4. **No retry logic**: If email fails, no automatic retry
5. **No rate limiting**: Single cron job processes all users sequentially
6. **No user dashboard**: Users must use extension or settings page to manage preferences

See `todo.md` for planned future enhancements.

---

## Emergency Procedures

### Stop All Digests Immediately
```sql
-- Option 1: Disable all users
UPDATE users SET digest_enabled = false;

-- Option 2: Unschedule cron job
SELECT cron.unschedule('send-morning-digest');
```

### Resume Digests
```sql
-- Re-enable users (or manually enable specific users)
UPDATE users SET digest_enabled = true WHERE email IN ('user1@example.com', 'user2@example.com');

-- Reschedule cron job (see "Set Up Cron Job" section above)
```

### Rollback Function
```bash
# If you have previous version saved
supabase functions deploy send-digest
```

---

## Success Criteria

The implementation is complete when:
- [x] All Edge Functions deployed and returning 200 status
- [x] Extension builds without errors
- [x] Extension connects to Supabase without CORS issues
- [ ] Settings page loads without 401 error **(TEST THIS NOW)**
- [ ] User can enable/disable digest via extension
- [ ] User can toggle digest via settings page
- [ ] Unsubscribe confirmation page works
- [ ] Manual digest trigger sends emails
- [ ] Cron job scheduled and runs daily
- [ ] All documentation complete

**Current priority: Test settings page fix (step 2 above)**
