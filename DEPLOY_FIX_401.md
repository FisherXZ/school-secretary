# 401 Error Fix - Deployment Guide

## 🎯 Executive Summary

**Problem**: Settings page returns 401 "Missing authorization header"
**Root Cause**: Supabase Edge Functions require JWT authentication by default
**Solution**: Disable JWT verification for publicly accessible functions
**Status**: ✅ Fix implemented, ready to deploy

---

## 📋 What Was Changed

### Files Added:
1. `supabase/functions/settings-page/deno.json` - Disables JWT verification
2. `supabase/functions/unsubscribe/deno.json` - Disables JWT verification
3. `DEBUG_LOG_401.md` - Detailed debugging log and analysis

### Why These Changes?
- **settings-page**: Accessed when user clicks "Digest Settings" in extension (browser opens URL directly, no auth)
- **unsubscribe**: Accessed when user clicks unsubscribe link in email (browser opens URL directly, no auth)
- Both functions need to be publicly accessible while using service role key internally for database access

### Configuration Added:
```json
{
  "verify_jwt": false
}
```

This tells Supabase to allow anonymous access to these specific functions.

---

## 🚀 Deployment Steps

### Prerequisites
- Supabase CLI installed: `npm install -g supabase`
- Authenticated with Supabase: `supabase login`
- Linked to your project: `supabase link --project-ref qguiewlbiopbsgfzpcrt`

### Step 1: Verify You Have Latest Code
```bash
cd /home/user/school-secretary
git status
```

Should show you're on branch `claude/morning-digest-email-VlfUr` with latest commits.

### Step 2: Deploy Functions
```bash
# Deploy both functions that were updated
supabase functions deploy settings-page
supabase functions deploy unsubscribe
```

**Expected output**:
```
Deploying Function...
 - settings-page
Created new Deployments: [...]
```

### Step 3: Verify Deployment
```bash
# Check function status
supabase functions list

# Check settings-page logs
supabase functions logs settings-page --tail

# Check unsubscribe logs
supabase functions logs unsubscribe --tail
```

---

## ✅ Testing Instructions

### Test 1: Settings Page Access (Primary Test)
1. Open extension popup
2. Click "Digest Settings" button
3. **Expected**: Page loads with:
   - Title: "📬 Digest Settings"
   - Your email address
   - Toggle button ("Turn Off Digest" if enabled)
4. **Previous error**: 401 "Missing authorization header"

**If it works**: ✅ Fix successful!
**If still 401**: See troubleshooting below

### Test 2: Settings Page Toggle
1. On settings page, click "Turn Off Digest"
2. **Expected**: Page reloads with success message
3. Check database: `digest_enabled` should be `false`
4. Click "Turn On Digest"
5. **Expected**: Page reloads, `digest_enabled` should be `true`

### Test 3: Unsubscribe Link
1. Get unsubscribe URL format:
   ```
   https://qguiewlbiopbsgfzpcrt.supabase.co/functions/v1/unsubscribe?id=YOUR_USER_ID
   ```
2. Replace `YOUR_USER_ID` with actual user ID from database
3. Open URL in browser
4. **Expected**: Confirmation page loads with "Yes, unsubscribe" button
5. Click "Yes, unsubscribe"
6. **Expected**: Success page loads

### Test 4: Database Sync
This verifies the database-as-source-of-truth feature:

1. Open extension popup (note current digest status)
2. Go to Supabase → Table Editor → users
3. Toggle `digest_enabled` from `true` to `false`
4. Close and reopen extension popup
5. **Expected**: Extension shows "Enable Digest" button (not "Digest Settings")
6. Toggle back to `true` in database
7. Reopen extension popup
8. **Expected**: Extension shows "Digest Settings" button

---

## 🔍 Verification Checklist

After deployment, verify:
- [ ] settings-page function deployed successfully
- [ ] unsubscribe function deployed successfully
- [ ] Settings page loads without 401 error
- [ ] Toggle button works on settings page
- [ ] Database updates when toggling
- [ ] Extension syncs with database on open
- [ ] Unsubscribe link accessible without error

---

## 🐛 Troubleshooting

### Issue: Still getting 401 after deployment

**Check 1: Verify deno.json was deployed**
```bash
# List files in deployed function
supabase functions logs settings-page | grep "deno.json"
```

**Check 2: Verify function redeployed**
```bash
# Get deployment timestamp
supabase functions list
```
Should show recent deployment time.

**Check 3: Clear browser cache**
```bash
# In browser
1. Open DevTools (F12)
2. Right-click refresh button
3. Select "Empty Cache and Hard Reload"
```

**Check 4: View function logs for errors**
```bash
supabase functions logs settings-page --tail
```
Try accessing settings page and watch for error messages.

### Issue: Function deploys but still requires auth

**Solution 1: Check deno.json syntax**
```bash
cat supabase/functions/settings-page/deno.json
```
Should show exactly:
```json
{
  "verify_jwt": false
}
```

**Solution 2: Try explicit import map**
Some Supabase versions require an import map. Create `supabase/functions/settings-page/import_map.json`:
```json
{
  "imports": {
    "@supabase/supabase-js": "https://esm.sh/@supabase/supabase-js@2"
  }
}
```

Then redeploy:
```bash
supabase functions deploy settings-page
```

**Solution 3: Check project settings**
1. Go to Supabase Dashboard → Project Settings
2. Check API → Edge Functions
3. Verify JWT verification can be disabled per function

### Issue: Database sync not working

**Debug steps**:
1. Open extension popup
2. Right-click popup → Inspect
3. Go to Console tab
4. Look for errors when popup opens
5. Run manual test:
   ```javascript
   chrome.storage.local.get(null, data => console.log('Storage:', data))
   ```
6. Should show `digestEmail`, `digestEnabled`, `digestUserId`

**Common fixes**:
- Reload extension at `chrome://extensions/`
- Clear extension storage:
  ```javascript
  chrome.storage.local.clear(() => console.log('Cleared'))
  ```
- Re-enable digest from extension

---

## 📊 Expected Outcomes

### Immediate (After Deployment):
- ✅ Settings page accessible without 401
- ✅ Toggle button works
- ✅ Unsubscribe link works

### Next Testing Phase:
1. Database sync verification (manual toggle test)
2. End-to-end digest flow (enable → receive email)
3. Cron job setup (daily 8am delivery)

---

## 🔄 Rollback Plan (If Needed)

If the fix causes issues:

```bash
# Remove deno.json files
rm supabase/functions/settings-page/deno.json
rm supabase/functions/unsubscribe/deno.json

# Redeploy without config
supabase functions deploy settings-page
supabase functions deploy unsubscribe
```

This reverts to JWT-required mode. You can then access settings page by:
1. Adding auth header in extension (more complex)
2. Creating proxy function that handles auth (workaround)

---

## 📝 Alternative Solutions (If This Doesn't Work)

### Alternative 1: Proxy Through Extension
Instead of opening settings page directly:
1. Extension creates a popup page
2. Popup page calls settings-page function with auth
3. Renders results in popup

**Pros**: Maintains security
**Cons**: More complex UX

### Alternative 2: Different Architecture
Use Supabase Auth + RLS:
1. User authenticates via Supabase Auth
2. Settings page uses client-side Supabase SDK
3. Row Level Security policies protect data

**Pros**: More secure, standard pattern
**Cons**: Requires significant refactor

### Alternative 3: Serverless Function on Different Platform
Deploy settings page to Vercel/Netlify:
1. Simple HTML page with JavaScript
2. Calls Supabase REST API with anon key
3. No JWT verification issues

**Pros**: Complete control
**Cons**: Additional infrastructure

---

## 🎓 What We Learned

### Root Cause
Supabase Edge Functions enforce JWT verification by default for security. This is correct behavior for API endpoints but problematic for web pages meant to be accessed directly from browsers.

### The Fix
Adding `deno.json` with `verify_jwt: false` tells Supabase this specific function should allow anonymous access. The function still uses service role key internally for database operations, maintaining security.

### Why This is Safe
1. **User ID validation**: Function checks if user ID is valid UUID
2. **Service role key**: Database queries use elevated permissions (server-side only)
3. **Read-only for user**: User can only toggle their own digest setting
4. **No sensitive data**: Settings page only shows email address (which user already knows)

### Security Considerations
- User ID is a UUID (hard to guess)
- Function validates input before database queries
- Database uses updated_at timestamp to detect unauthorized changes
- Worst case: Someone could disable digest for a user (minor impact, easily re-enabled)

---

## 📞 Support

If you encounter issues during deployment:

1. **Check DEBUG_LOG_401.md** for detailed analysis
2. **Review function logs**:
   ```bash
   supabase functions logs settings-page --tail
   ```
3. **Share these with me**:
   - Error message from browser
   - Function logs output
   - Network tab screenshot (F12 → Network)

---

## ✨ Success Criteria

Deployment is successful when:
- [  ] Settings page loads without 401 error
- [  ] Can toggle digest on/off from settings page
- [  ] Database updates reflect in extension
- [  ] Unsubscribe link works from email
- [  ] No console errors in browser or function logs

**After successful deployment, proceed to comprehensive testing using `TEST_DATABASE_SYNC.md`**
