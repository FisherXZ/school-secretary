# Settings Page 401 Error - Debugging Log

## Problem Statement
**Error**: `{"code":401,"message":"Missing authorization header"}`
**URL**: `https://qguiewlbiopbsgfzpcrt.supabase.co/functions/v1/settings-page?id=5fd269ce-cf2c-47ec-94b4-3475b93e6dc6`
**Date**: 2026-01-12 03:30 UTC

## Hypothesis Tree

### H1: Edge Function requires authentication but we're not providing it
- **Evidence**: 401 error typically means unauthorized
- **Test**: Call function with Authorization header
- **Fix**: Either provide auth header OR make function publicly accessible

### H2: Environment variables (secrets) are not configured
- **Evidence**: Function uses `Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')`
- **Test**: Check function logs for env var errors
- **Fix**: Configure missing secrets

### H3: Edge Function deployment issue
- **Evidence**: Previous deployments may have failed
- **Test**: Check function status and logs
- **Fix**: Redeploy function

### H4: Supabase Edge Functions default to requiring auth
- **Evidence**: All Edge Functions may require auth by default
- **Test**: Check Supabase Edge Function auth settings
- **Fix**: Configure function to allow anonymous access

---

## Test Log

### Test 0: Verify Current Deployment Status
**Time**: 2026-01-12 03:30 UTC
**Objective**: Confirm function is deployed and check for obvious issues

**Actions**:
1. Attempted to call function without auth header
2. Got 403 from container (network blocked)
3. User's browser shows 401 "Missing authorization header"

**Result**: ❌ Function requires authentication
**Conclusion**: Supabase Edge Functions require auth by default

---

## Root Cause Analysis

**Finding**: Supabase Edge Functions require an Authorization header by default when called from external sources (like a browser opening the URL directly).

**Why this is a problem**:
1. User clicks "Digest Settings" in extension
2. Extension opens URL: `https://...supabase.co/functions/v1/settings-page?id=xxx`
3. Browser makes GET request with NO auth headers
4. Supabase API Gateway rejects with 401 before function even runs

**Why other functions work**:
- `signup-user`: Called from extension with `Authorization: Bearer ${SUPABASE_ANON_KEY}` header
- `send-digest`: Called by cron with service role key
- `unsubscribe`: Should have same problem! (Need to verify)

**Solution options**:
1. ✅ **Configure Edge Function to allow anonymous access** (Recommended for web pages)
2. ❌ Pass auth header in URL (security risk, tokens visible in URL)
3. ❌ Use a different architecture (too complex)

---

## Solution: Configure JWT Verification

Supabase Edge Functions support JWT verification settings. We need to:
1. Allow anonymous access to settings-page function
2. Use internal service role key for database queries (already done)
3. Validate user ID parameter for security

### Implementation Plan

**Test 1**: Check current settings-page function code
**Test 2**: Update function to handle JWT verification properly
**Test 3**: Add proper error handling
**Test 4**: Deploy and verify

---

## Test 1: Create JWT Verification Config
**Time**: 2026-01-12 03:45 UTC
**Objective**: Disable JWT verification for publicly accessible functions

**Actions**:
1. Created `supabase/functions/settings-page/deno.json` with `verify_jwt: false`
2. Created `supabase/functions/unsubscribe/deno.json` with `verify_jwt: false`

**Rationale**:
- These functions are accessed directly from browsers (not from authenticated API calls)
- settings-page: Opened when user clicks button in extension
- unsubscribe: Opened when user clicks link in email
- Both need to work without requiring JWT authentication

**Expected Result**: ✅ Functions should be accessible without Authorization header

**Configuration added**:
```json
{
  "verify_jwt": false
}
```

**Status**: ✅ Config created, pending deployment

---
