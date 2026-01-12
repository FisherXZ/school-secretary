# Database Sync & Settings Page Testing Guide

## Current Issues to Verify
1. **Database sync** - Not yet verified
2. **Settings page** - "Not reduced correctly" (redirect/rendering issue)

## Test 1: Database Sync (Source of Truth)

This test verifies that the extension always shows the correct status from the database, not local storage.

### Setup
1. Make sure you have digest enabled
2. Verify in Supabase Table Editor:
   ```
   SELECT id, email, digest_enabled FROM users WHERE email = 'YOUR_EMAIL';
   ```
   - Should show `digest_enabled: true`

### Test Steps

#### Test 1A: Disable in Database, Verify Extension Syncs
1. **Disable in database:**
   - Go to Supabase Dashboard → Table Editor → users table
   - Find your row
   - Change `digest_enabled` from `true` to `false`
   - Click Save

2. **Check extension syncs:**
   - Close extension popup if open
   - Click extension icon to open popup
   - **Expected**: Should show "Enable Digest" button (not "Digest Settings")
   - **If it shows "Digest Settings"**: Database sync is NOT working

3. **Re-enable in database:**
   - Change `digest_enabled` back to `true` in Supabase
   - Close and reopen extension popup
   - **Expected**: Should show "Digest Settings" button

#### Test 1B: Verify Sync Function in Console
1. Open extension popup
2. Right-click popup → Inspect
3. Go to Console tab
4. Run this command:
   ```javascript
   checkDigestStatus().then(status => console.log('Digest status:', status))
   ```
5. **Expected output:**
   ```
   Digest status: { enabled: true, email: "your@email.com" }
   ```
6. If you get an error or wrong status, that's the issue

---

## Test 2: Settings Page

### Test 2A: Can Settings Page Load?
1. Open extension popup
2. Click "Digest Settings" button
3. **Expected**: New tab opens with settings page showing:
   - Title: "📬 Digest Settings"
   - Your email address
   - Toggle button (green "Turn Off Digest" if enabled)
4. **If you see error** (401, 404, or other):
   - Copy the URL from address bar
   - Copy the error message
   - Share both with me

### Test 2B: Can You Toggle Digest?
1. On settings page, click "Turn Off Digest" button
2. **Expected**: Page reloads, shows:
   - Success message: "✓ Digest disabled."
   - Red "Turn On Digest" button
3. Check database:
   ```sql
   SELECT digest_enabled FROM users WHERE email = 'YOUR_EMAIL';
   ```
   - Should be `false`

4. Click "Turn On Digest" button
5. **Expected**: Page reloads, shows:
   - Success message: "✓ Digest enabled!"
   - Green "Turn Off Digest" button
6. Check database again - should be `true`

### Test 2C: Does Extension Sync After Settings Change?
1. Keep settings page open
2. Click "Turn Off Digest"
3. Go back to Canvas page
4. Open extension popup
5. **Expected**: Should show "Enable Digest" button
6. Close popup, go back to settings page
7. Click "Turn On Digest"
8. Open extension popup again
9. **Expected**: Should show "Digest Settings" button

---

## Common Issues & Fixes

### Issue: Extension shows wrong status after database change
**Root cause**: Database sync not working

**Debug steps:**
1. Check browser console for errors when opening popup
2. Verify Supabase URL and anon key are correct in `popup.ts`:
   ```javascript
   const SUPABASE_URL = 'https://qguiewlbiopbsgfzpcrt.supabase.co';
   const SUPABASE_ANON_KEY = 'eyJ...' // Long JWT token
   ```
3. Check network tab in DevTools:
   - Should see request to: `https://qguiewlbiopbsgfzpcrt.supabase.co/rest/v1/users?email=eq.YOUR_EMAIL`
   - Should return 200 status with user data

**Fix if needed:**
- Rebuild extension: `npm run build`
- Reload extension at `chrome://extensions/`

### Issue: Settings page shows 401 error
**Root cause**: Edge function not deployed or missing secrets

**Debug steps:**
1. Verify function is deployed:
   ```bash
   supabase functions list
   ```
   - Should show `settings-page` with status "Deployed"

2. Check function logs:
   - Go to Supabase Dashboard → Edge Functions → settings-page → Logs
   - Look for errors

**Fix:**
```bash
supabase functions deploy settings-page
```

### Issue: Settings page shows "no user" message
**Root cause**: User ID not passed correctly in URL

**Debug steps:**
1. Check URL in browser address bar when settings page opens
2. Should look like:
   ```
   https://qguiewlbiopbsgfzpcrt.supabase.co/functions/v1/settings-page?id=12345678-1234-1234-1234-123456789abc
   ```
3. If `id=` is missing, check chrome.storage.local:
   - In extension popup DevTools console:
   ```javascript
   chrome.storage.local.get(['digestUserId'], data => console.log(data))
   ```
   - Should show: `{digestUserId: "12345678-..."}`

**Fix if digestUserId is missing:**
1. Re-enable digest via extension
2. Check storage again - should now have userId

### Issue: Toggle button doesn't work (no redirect)
**Root cause**: Settings page expecting different URL format

**Debug:**
1. Click toggle button
2. Check browser network tab (F12 → Network)
3. Should see redirect to same page with `success=enabled` or `success=disabled` parameter
4. If you see error response, check function logs

---

## Success Criteria

All tests pass when:
- [  ] Extension syncs with database on every popup open
- [  ] Changing database directly updates extension UI
- [  ] Settings page loads without errors
- [  ] Toggle button works and updates database
- [  ] Extension reflects settings page changes
- [  ] No console errors

---

## Debugging Commands

### Check user in database:
```sql
SELECT * FROM users WHERE email = 'YOUR_EMAIL';
```

### Check chrome storage:
```javascript
chrome.storage.local.get(null, data => console.log('All storage:', data))
```

### Test database connection:
```javascript
fetch('https://qguiewlbiopbsgfzpcrt.supabase.co/rest/v1/users?select=id', {
  headers: {
    'apikey': 'YOUR_ANON_KEY',
    'Authorization': 'Bearer YOUR_ANON_KEY'
  }
}).then(r => r.json()).then(d => console.log('Users:', d))
```

### Clear extension storage (reset):
```javascript
chrome.storage.local.clear(() => console.log('Storage cleared'))
```

---

## Report Results

After running these tests, please share:
1. Which tests passed ✅
2. Which tests failed ❌
3. Error messages (from console or network tab)
4. Screenshots if helpful

This will help me identify the exact issue and provide a fix.
