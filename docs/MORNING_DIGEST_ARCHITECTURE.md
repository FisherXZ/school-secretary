# Morning Digest Architecture

Technical architecture documentation for Layer 2 (Morning Digest feature).

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     CHROME EXTENSION                            │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  popup.ts                                                 │  │
│  │  • Shows digest signup after OAuth                        │  │
│  │  • Calls signup-user Edge Function                        │  │
│  │  • Stores user_id in chrome.storage                       │  │
│  │  • Opens settings page                                    │  │
│  └──────────────────────────────────────────────────────────┘  │
└──────────────────────────┬──────────────────────────────────────┘
                           │ HTTPS
                           │ (SUPABASE_ANON_KEY)
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                        SUPABASE                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  POSTGRES DATABASE                                        │  │
│  │                                                           │  │
│  │  users table:                                             │  │
│  │  • id (uuid, primary key)                                 │  │
│  │  • email (unique)                                         │  │
│  │  • google_refresh_token (encrypted)                       │  │
│  │  • google_access_token (cached)                           │  │
│  │  • token_expires_at                                       │  │
│  │  • timezone (for 8am calculation)                         │  │
│  │  • digest_enabled (boolean)                               │  │
│  │  • created_at, updated_at                                 │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  EDGE FUNCTIONS (Deno runtime)                            │  │
│  │                                                           │  │
│  │  1. signup-user                                           │  │
│  │     • Validates email + refresh token                     │  │
│  │     • Upserts user to database                            │  │
│  │     • Sends welcome email                                 │  │
│  │     • Returns user_id                                     │  │
│  │                                                           │  │
│  │  2. send-digest (cron job)                                │  │
│  │     • Queries users with digest_enabled=true              │  │
│  │     • Refreshes Google access tokens                      │  │
│  │     • Fetches calendar events (next 7 days)               │  │
│  │     • Filters to Canvas homework                          │  │
│  │     • Groups by today vs this week                        │  │
│  │     • Sends email via Resend API                          │  │
│  │     • Returns success/failure counts                      │  │
│  │                                                           │  │
│  │  3. unsubscribe                                           │  │
│  │     • Sets digest_enabled=false                           │  │
│  │     • Returns HTML confirmation page                      │  │
│  │                                                           │  │
│  │  4. settings-page                                         │  │
│  │     • Fetches user by id                                  │  │
│  │     • Shows current status                                │  │
│  │     • Handles enable/disable toggle                       │  │
│  │     • Returns HTML page                                   │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  CRON (pg_cron)                                           │  │
│  │                                                           │  │
│  │  Schedule: 0 16 * * * (4pm UTC = 8am PST)                 │  │
│  │  Action: POST to send-digest function                     │  │
│  │  Auth: Service role key                                   │  │
│  └──────────────────────────────────────────────────────────┘  │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                ┌──────────┴──────────┐
                │                     │
                ▼                     ▼
┌────────────────────────┐  ┌────────────────────────┐
│   GOOGLE APIS          │  │   RESEND               │
│                        │  │                        │
│  OAuth Token Endpoint  │  │  Email Delivery API    │
│  • Refresh tokens      │  │  • Welcome emails      │
│  • Get access tokens   │  │  • Daily digests       │
│                        │  │  • Free: 100/day       │
│  Calendar API          │  │                        │
│  • Fetch events        │  └────────────────────────┘
│  • Get timezone        │
│  • Get user email      │
│                        │
└────────────────────────┘
```

## Data Flow

### Signup Flow

```
1. User clicks "Connect Google Calendar" in extension
   └─> Chrome Identity API: getAuthToken()
       └─> Returns access token

2. Extension shows digest signup prompt
   └─> Fetches user email from Google
   └─> Fetches timezone from Google Calendar
   └─> Checks if user exists in Supabase

3. User clicks "Enable Digest"
   └─> POST to signup-user Edge Function
       {
         email: "user@example.com",
         google_refresh_token: "1//xxxxx",
         timezone: "America/Los_Angeles"
       }

4. signup-user function:
   └─> Validates input
   └─> Upserts to users table
   └─> POST to Resend API (welcome email)
   └─> Returns { success: true, user_id: "uuid" }

5. Extension stores result:
   └─> chrome.storage.local.set({
         digestEnabled: true,
         digestEmail: "user@example.com",
         digestUserId: "uuid"
       })
```

### Daily Digest Flow

```
1. Cron job triggers at 8am (user's local time)
   └─> pg_cron executes scheduled SQL
       └─> net.http_post() to send-digest function
           (with service_role authorization)

2. send-digest function:
   └─> SELECT * FROM users WHERE digest_enabled = true

3. For each user:
   a) Check if access token is expired
      └─> If expired:
          POST to https://oauth2.googleapis.com/token
          (grant_type=refresh_token)
          └─> Get new access token
          └─> UPDATE users SET google_access_token, token_expires_at

   b) Fetch calendar events:
      GET https://www.googleapis.com/calendar/v3/calendars/primary/events
      Params:
        - timeMin: now
        - timeMax: now + 7 days
        - timeZone: user's timezone
      Headers:
        - Authorization: Bearer {access_token}

   c) Filter to homework:
      events.filter(e =>
        e.extendedProperties?.private?.canvasAssignmentId != null
      )

   d) Group by date:
      - today: events with date === user's today
      - thisWeek: events with date > user's today

   e) Build email:
      Subject: "📅 Your Monday, Feb 12"
      Body: Plain text with TODAY and THIS WEEK sections

   f) Send email:
      POST to https://api.resend.com/emails
      {
        from: "school-secretary <digest@domain.com>",
        to: user.email,
        subject: "...",
        text: "..."
      }

4. Function returns:
   {
     success: true,
     processed: 100,
     failed: 2,
     total: 102,
     errors: ["user1@ex.com: Token expired", ...]
   }
```

### Unsubscribe Flow

```
1. User clicks unsubscribe link in email:
   https://PROJECT.supabase.co/functions/v1/unsubscribe?id=USER_UUID

2. unsubscribe function:
   └─> Validates UUID format
   └─> UPDATE users SET digest_enabled = false WHERE id = ?
   └─> Returns HTML confirmation page

3. User sees: "You've been unsubscribed"
```

### Settings Flow

```
1. User clicks "Digest settings" in extension:
   chrome.tabs.create({
     url: "https://PROJECT.supabase.co/functions/v1/settings-page?id=USER_ID"
   })

2. settings-page function:
   └─> If action=enable:
       UPDATE users SET digest_enabled = true
       Redirect to ?id=USER_ID&success=enabled

   └─> If action=disable:
       UPDATE users SET digest_enabled = false
       Redirect to ?id=USER_ID&success=disabled

   └─> Otherwise:
       SELECT email, digest_enabled FROM users WHERE id = USER_ID
       Render HTML page with toggle button

3. User sees settings page with current status and toggle
```

## Component Responsibilities

### Chrome Extension (`src/popup/`)

**Responsibilities:**
- Trigger Google OAuth flow
- Present digest signup UI
- Collect user consent
- Call Supabase API to create subscription
- Store user preferences locally
- Open settings page

**Key Files:**
- `popup.html`: UI with digest section
- `popup.ts`: Signup logic, API calls
- `popup.css`: Digest section styles

**External APIs:**
- Google OAuth (via Chrome Identity API)
- Google Calendar API (timezone, email)
- Supabase REST API (check existing user)
- Supabase Edge Functions (signup)

### Supabase Database

**Responsibilities:**
- Store user subscriptions
- Store Google OAuth tokens (encrypted at rest)
- Cache access tokens to reduce API calls
- Track user preferences (timezone, enabled status)

**Key Features:**
- UPSERT on email (handles re-signups)
- Automatic updated_at trigger
- Indexes for fast cron queries
- UUID primary keys (non-guessable unsubscribe links)

### Supabase Edge Functions

**Responsibilities:**
- Handle API requests from extension
- Process user signups
- Send daily digests (cron job)
- Serve user-facing pages (settings, unsubscribe)

**Runtime:** Deno (TypeScript, V8 engine)
**Authentication:**
- Extension uses `anon` key (read-only)
- Functions use `service_role` key (full access)
- Cron uses `service_role` key

**Key Features:**
- CORS support for extension
- Input validation
- Error handling (continue on single-user failure)
- Token refresh logic
- Email delivery

### Google APIs

**Calendar API:**
- Fetch events for date range
- Filter by timezone
- Get user settings (timezone)

**OAuth API:**
- Exchange refresh token for access token
- Get user info (email)

**Rate Limits:**
- ~10 requests/second
- 1,000,000 requests/day (plenty for MVP)

### Resend

**Responsibilities:**
- Deliver emails reliably
- Track delivery status
- Provide analytics

**Rate Limits (Free Tier):**
- 100 emails/day
- 3,000 emails/month

**Email Types:**
1. Welcome email (triggered on signup)
2. Daily digest (triggered by cron)

## Security Architecture

### Secrets Management

| Secret | Location | Exposure | Usage |
|--------|----------|----------|-------|
| `SUPABASE_ANON_KEY` | Extension code | Public | Check if user exists |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase (auto-injected) | Private | Edge Functions database access |
| `RESEND_API_KEY` | Supabase secrets | Private | Send emails |
| `GOOGLE_CLIENT_ID` | Extension manifest + Supabase secrets | Public + Private | OAuth |
| `GOOGLE_CLIENT_SECRET` | Supabase secrets | Private | Token refresh |
| User refresh tokens | Database (encrypted) | Private | Calendar access |

### Authentication Flow

**Extension → Supabase:**
```
Extension ─────┐
               │ (SUPABASE_ANON_KEY)
               ▼
          Supabase REST API
               │
               └─> Row Level Security
                   (can only read via API key)
```

**Edge Function → Database:**
```
Edge Function ─────┐
                   │ (SUPABASE_SERVICE_ROLE_KEY, auto-injected)
                   ▼
              Database
                   │
                   └─> No RLS (service role bypasses)
```

**Edge Function → Google:**
```
Edge Function ─────┐
                   │ (user's google_refresh_token from database)
                   ▼
         Google Token Endpoint
                   │
                   └─> Returns access_token
                       ─────┐
                            │ (access_token)
                            ▼
                  Google Calendar API
```

### Data Encryption

- **At rest:** Supabase encrypts all database data
- **In transit:** All connections use HTTPS/TLS
- **Tokens:** Refresh tokens stored encrypted in Postgres
- **Secrets:** Edge Function secrets encrypted by Supabase

### Attack Surface

**Minimal:**
- Extension only makes read API calls (anon key)
- Unsubscribe uses non-guessable UUIDs
- No authentication required for settings (UUID-based access)
- No user input stored without validation

**Potential Issues:**
- User can revoke Google access → digest stops working
- Malicious user can disable others' digests if they know UUID
  - Mitigation: UUIDs are effectively unguessable (2^122 combinations)

## Scaling Considerations

### Current Limits

- **Resend Free Tier:** 100 emails/day
  - Supports up to 100 users
  - Upgrade to Pro: $20/mo for 50,000 emails/month

- **Supabase Free Tier:**
  - 500 MB database (plenty for user data)
  - 2 GB bandwidth/month
  - Unlimited Edge Function invocations

- **Google Calendar API:**
  - 1,000,000 requests/day (quota)
  - ~10 requests/second (rate limit)

### Performance

**Single User Processing Time:**
- Token refresh: ~200ms (if needed)
- Calendar fetch: ~300ms
- Event filtering: ~10ms
- Email send: ~500ms
- **Total: ~1 second per user**

**100 Users:**
- Sequential processing: ~100 seconds (~1.5 minutes)
- Acceptable for daily cron

**1000 Users:**
- Sequential: ~1000 seconds (~16 minutes)
- Consider parallelization or batching

### Optimization Strategies (Future)

1. **Parallel Processing:**
   - Use Promise.all() to process users in batches
   - Respect Google API rate limits (10 req/sec)

2. **Caching:**
   - Cache access tokens (already implemented)
   - Cache calendar events for 1 hour (if querying multiple times)

3. **Batching:**
   - Send multiple emails in single Resend API call
   - Batch database updates

4. **Per-User Cron:**
   - Create separate cron jobs for different timezones
   - Distribute load throughout the day

## Monitoring and Observability

### Logs

**Supabase Edge Functions:**
- Dashboard: Edge Functions → [function] → Logs
- CLI: `supabase functions logs [function] --follow`
- Retention: 7 days

**Cron Job History:**
```sql
SELECT * FROM cron.job_run_details
ORDER BY start_time DESC;
```

**Resend:**
- Dashboard: Logs → Filter by date
- Webhook support for events (delivered, opened, bounced)

### Key Metrics

1. **Digest Success Rate:**
   - `processed / total` from send-digest response
   - Target: >95%

2. **Email Delivery Rate:**
   - Check Resend dashboard
   - Target: >98%

3. **Token Refresh Failures:**
   - Check send-digest logs for "Token refresh failed"
   - Investigate user whose tokens expired

4. **User Growth:**
   ```sql
   SELECT DATE(created_at), COUNT(*) FROM users
   GROUP BY DATE(created_at)
   ORDER BY DATE(created_at) DESC;
   ```

### Alerts (Future)

- Cron job failure (via Supabase webhooks)
- High failure rate in send-digest (>10%)
- Resend quota approaching limit (>80 emails/day)

## Testing Strategy

### Unit Testing (Not Implemented Yet)

Potential test files:
- `src/popup/popup.test.ts` (extension logic)
- `supabase/functions/*/index.test.ts` (Edge Function logic)

### Integration Testing

**Manual Testing Checklist:**
- [ ] Signup flow (new user)
- [ ] Signup flow (existing user)
- [ ] Send digest (with homework)
- [ ] Send digest (no homework)
- [ ] Unsubscribe
- [ ] Settings toggle
- [ ] Token refresh (simulate expired token)

**Automated Testing (Future):**
- Supabase Test Helpers (simulate database)
- Mock Google Calendar API responses
- Mock Resend API

### End-to-End Testing

1. Create test user with known email
2. Enable digest
3. Manually trigger send-digest
4. Verify email received
5. Click unsubscribe
6. Verify digest_enabled = false
7. Re-enable via settings
8. Verify digest_enabled = true

## Known Limitations

1. **Refresh Token Issue:**
   - Chrome Identity API doesn't provide refresh tokens directly
   - Current implementation uses access token as placeholder
   - TODO: Implement full OAuth flow with `chrome.identity.launchWebAuthFlow`

2. **Single Timezone:**
   - Cron runs at fixed UTC time (e.g., 4pm UTC = 8am PST)
   - Users in other timezones get digest at different local times
   - Future: Per-user cron or staggered sends

3. **No Retry Logic:**
   - If email send fails, it's not retried until next day
   - Future: Implement exponential backoff for transient failures

4. **No Email Analytics:**
   - Can't see if users open emails or click links
   - Future: Enable Resend webhooks for tracking

5. **Plain Text Only:**
   - Emails are plain text (no styling)
   - Future: Add HTML template with branding

## Future Architecture Changes

### Phase 2: Per-User Timezones

Instead of single cron at 8am PST, run cron every hour:

```sql
SELECT cron.schedule(
  'send-morning-digest-hourly',
  '0 * * * *',  -- Every hour
  $$
  SELECT net.http_post(
    url := 'https://PROJECT.supabase.co/functions/v1/send-digest-hourly'
  );
  $$
);
```

Update send-digest to only process users whose local time is 8am:

```typescript
const now = new Date();
const users = await supabase
  .from('users')
  .select('*')
  .eq('digest_enabled', true);

// Filter to users where it's currently 8am in their timezone
const usersToProcess = users.filter(user => {
  const localHour = now.toLocaleString('en-US', {
    hour: 'numeric',
    hour12: false,
    timeZone: user.timezone
  });
  return localHour === '8';
});
```

### Phase 3: Configurable Send Time

Add `send_time` column to users table:

```sql
ALTER TABLE users ADD COLUMN send_time TIME DEFAULT '08:00:00';
```

Update cron logic to match user's preferred time.

### Phase 4: SMS Notifications

- Add phone number to users table
- Integrate with Twilio
- Send SMS version of digest (truncated)

---

**Document Version:** 1.0
**Last Updated:** 2026-01-11
**Author:** Layer 2 Implementation
