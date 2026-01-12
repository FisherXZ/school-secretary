# Immediate Actions Required

## ✅ Completed
- All Edge Functions deployed (signup-user, send-digest, unsubscribe, settings-page)
- Database schema created
- Extension rebuilt with latest fixes
- Settings page 401 fix implemented and deployed
- Source-of-truth database sync implemented
- Two-step unsubscribe confirmation implemented
- All changes committed and pushed to `claude/morning-digest-email-VlfUr`

## 🔴 Critical: Do These Now

### 1. Reload Extension (1 minute)
The extension was just rebuilt with the latest fixes. You must reload it:

1. Open Chrome: `chrome://extensions/`
2. Find "Canvas Calendar Sync"
3. Click the refresh/reload icon (circular arrow)
4. Verify no errors appear in the console

### 2. Test Settings Page Fix (2 minutes)
This is the last bug we fixed - verify it works:

1. Open the extension popup (click extension icon)
2. Click "Digest Settings" button
3. **Expected**: Settings page loads with your email and toggle switch
4. **Previous error**: 401 "Missing authorization header"
5. **If it works**: You're ready for next step!
6. **If it fails**: Let me know the exact error message

### 3. Set Up Cron Job (5 minutes)
**The digest won't run automatically until you do this.**

Your Supabase Project: `qguiewlbiopbsgfzpcrt`

#### Steps:
1. Go to https://supabase.com/dashboard/project/qguiewlbiopbsgfzpcrt/sql/new
2. Paste this SQL query:

```sql
SELECT cron.schedule(
  'send-morning-digest',
  '0 16 * * *',  -- 4pm UTC = 8am PST
  $$
  SELECT net.http_post(
    url := 'https://qguiewlbiopbsgfzpcrt.supabase.co/functions/v1/send-digest',
    headers := '{"Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
  );
  $$
);
```

3. Replace `YOUR_SERVICE_ROLE_KEY` with your actual service role key:
   - Go to https://supabase.com/dashboard/project/qguiewlbiopbsgfzpcrt/settings/api
   - Copy the `service_role` key (starts with `eyJ...`, very long)
   - Paste it in the SQL query
4. Click "Run" to execute
5. Verify success: Run this query to check:

```sql
SELECT * FROM cron.job WHERE jobname = 'send-morning-digest';
```

You should see one row with:
- `jobname`: send-morning-digest
- `schedule`: 0 16 * * *
- `active`: true

### 4. Manual Digest Test (3 minutes)
Test the digest before waiting for tomorrow morning:

```bash
curl -X POST https://qguiewlbiopbsgfzpcrt.supabase.co/functions/v1/send-digest \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY"
```

Replace `YOUR_SERVICE_ROLE_KEY` with the same key from step 3.

**What should happen:**
- Function processes all users where digest_enabled = true
- Sends email to each user
- Returns success message

**Check results:**
1. Supabase logs: https://supabase.com/dashboard/project/qguiewlbiopbsgfzpcrt/functions/send-digest/logs
2. Resend logs: https://resend.com/dashboard (check email delivery)
3. Your email inbox (should receive digest)

---

## 📋 After Testing

Once all 4 steps above work:

1. Review full testing checklist: `TESTING_CHECKLIST.md`
2. Test edge cases (unsubscribe, re-subscribe, settings toggle)
3. Monitor cron job runs: https://supabase.com/dashboard/project/qguiewlbiopbsgfzpcrt/database/tables
   - Query: `SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 5;`
4. Check Resend delivery rate: https://resend.com/dashboard
5. Create PR when ready to merge

---

## 🆘 Troubleshooting

### Settings page still shows 401
- Clear browser cache and try again
- Verify extension was reloaded
- Check browser console for error details

### Manual digest returns error
- Verify service role key is correct (not anon key)
- Check send-digest logs for details
- Verify at least one user has digest_enabled = true

### No email received
- Check Resend dashboard for delivery status
- Check spam folder
- Verify email address in database matches your inbox
- Check send-digest logs for errors

### Cron job doesn't run
- Verify cron job is scheduled: `SELECT * FROM cron.job;`
- Check active = true
- View run history: `SELECT * FROM cron.job_run_details ORDER BY start_time DESC;`
- Note: Job runs at 4pm UTC (8am PST) - adjust time for testing if needed

---

## 📊 Current Configuration

- **Project**: qguiewlbiopbsgfzpcrt
- **Region**: Likely US-based (check dashboard)
- **Functions**:
  - signup-user: ✅ Deployed
  - send-digest: ✅ Deployed
  - unsubscribe: ✅ Deployed
  - settings-page: ✅ Deployed (with 401 fix)
- **Database**: users table created with indexes
- **Cron**: ⏳ Pending your setup (step 3 above)

---

## 🎯 Success Criteria

The implementation is complete when:
- [x] All Edge Functions deployed
- [x] Extension builds and loads
- [ ] **Settings page loads without 401** ← TEST THIS NOW
- [ ] Manual digest test sends email ← TEST THIS AFTER CRON SETUP
- [ ] Cron job scheduled and verified
- [ ] Full testing checklist passed

**Start with step 1 above (reload extension), then work through steps 2-4.**
