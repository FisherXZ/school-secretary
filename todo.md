# Canvas Calendar Sync - Future Enhancements

## Layer 1: Assignment Handling

### Handle Assignments Without Due Dates
**Location**: `src/background/background.ts:143`

Currently, assignments without due dates are skipped during sync. Future enhancement should:
- Allow users to optionally sync assignments without due dates
- Provide UI option to choose how to handle these (skip, sync with custom date, etc.)
- Consider creating all-day events or events with flexible dates for assignments without due dates

**Status**: Deferred for MVP

---

## Layer 2: Logging & Monitoring

### Structured Logging
**Location**: `supabase/functions/send-digest/index.ts`, `supabase/functions/signup-user/index.ts`

**Current state**: Ad-hoc console.log statements
```typescript
console.log('Email sent to user@example.com');
console.error('Error processing user:', error);
```

**Problem**:
- Hard to search through logs
- No consistent structure
- Success and error messages mixed together
- Difficult to aggregate metrics

**Recommendation**: Implement structured logging
```typescript
logger.info('email_sent', {
  user_id: user.id,
  email: user.email,
  assignments_today: today.length,
  assignments_week: thisWeek.length,
  timestamp: new Date().toISOString()
});

logger.error('user_processing_failed', {
  user_id: user.id,
  error: error.message,
  error_type: 'token_refresh_failed',
  stack_trace: error.stack
});
```

**Benefits**:
- Search for all `token_refresh_failed` errors across all users
- Generate metrics on digest size (avg assignments per email)
- Track success rates per user
- Better debugging with structured data

**Implementation**:
- Use a logging library (e.g., `winston`, `pino`)
- Define log levels (info, warn, error)
- Add correlation IDs for tracing requests

**Complexity**: Low
**Priority**: Medium (implement before scale)
**Status**: Planned for Phase 2

---

### Alerting System
**Location**: Supabase cron + external monitoring

**Current state**: Manual log checking only

**Problem**:
- Must remember to check logs
- Issues discovered after user complaints
- No proactive problem detection

**Recommendation**: Set up automated alerts for:
1. **Cron job failure** - Didn't run at all
2. **High error rate** - >10% of users failed processing
3. **Email bounce rate spike** - >5% bounced
4. **Zero users processed** - Possible database connectivity issue
5. **Token refresh failures** - >5% of users need re-authentication

**Alert destinations**:
- Slack channel (#school-secretary-alerts)
- Email to operations team
- PagerDuty for critical issues (cron didn't run)

**Implementation**:
- Use Supabase webhooks or pg_notify
- Connect to alerting service (PagerDuty, Opsgenie)
- Set up Resend webhook for bounce notifications
- Create thresholds in monitoring dashboard

**Complexity**: Medium
**Priority**: High (basic cron failure alert before launch)
**Status**:
- ✅ Basic cron monitoring - Planned for Phase 1
- Advanced alerts - Planned for Phase 2

---

## Layer 2: User Management

### User-Level Audit Trail
**Location**: New table `user_events`, functions across codebase

**Current state**: No history of user actions

**Problem**:
- Can't debug "why did user stop getting emails?"
- No visibility into user behavior patterns
- Difficult to troubleshoot individual user issues

**Recommendation**: Create audit trail table
```sql
CREATE TABLE user_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  event_type TEXT NOT NULL,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  details JSONB,
  source TEXT  -- 'extension', 'cron', 'settings_page', 'unsubscribe'
);

CREATE INDEX idx_user_events_user_id ON user_events(user_id);
CREATE INDEX idx_user_events_timestamp ON user_events(timestamp);
```

**Example events to track**:
```
user_id | event_type       | timestamp           | details                    | source
--------|------------------|---------------------|----------------------------|-------------
abc-123 | digest_enabled   | 2024-01-10 10:00am | {"timezone": "PST"}        | extension
abc-123 | digest_sent      | 2024-01-11 08:00am | {"items_today": 5}         | cron
abc-123 | settings_viewed  | 2024-01-11 02:00pm | null                       | settings_page
abc-123 | digest_disabled  | 2024-01-11 02:01pm | {"reason": "user_toggle"}  | settings_page
abc-123 | email_bounced    | 2024-01-12 08:00am | {"bounce_type": "hard"}    | webhook
abc-123 | token_refreshed  | 2024-01-13 08:00am | {"success": true}          | cron
```

**Use cases**:
- Debug: "User says they're not getting emails" → Check event log for failures
- Analytics: How many users toggle digest off/on?
- Retention: Identify users who haven't engaged in 30 days
- Support: Full history when user contacts support

**Implementation**:
1. Create database table
2. Add logging to all user-touching functions:
   - `signup-user`: digest_enabled event
   - `send-digest`: digest_sent, digest_failed events
   - `unsubscribe`: digest_disabled event
   - `settings-page`: settings_viewed, digest_toggled events
3. Optional: Add Resend webhook handler for email events

**Complexity**: Medium (new table + updates to 4 functions)
**Priority**: Medium (valuable for support, not blocking)
**Status**: Planned for Phase 2

---

## Layer 2: Multi-Timezone Support

### Phase 1: Document Current Limitations (MVP)
**Location**: Documentation, user-facing messaging

**Current state**: Single cron at 8am PST (4pm UTC)

**Recommendation**:
- Document in user-facing FAQ: "Digests are optimized for Pacific timezone"
- Add to settings page: "Emails sent at 8am PST"
- Track user timezones in analytics to understand need

**Benefits**:
- Sets expectations for early users
- Provides data on timezone distribution
- Low-effort MVP validation

**Complexity**: Very Low (docs only)
**Priority**: High (before launch)
**Status**: Planned for Phase 1 (MVP)

---

### Phase 2: Major US Timezone Support
**Location**: `supabase/schema.sql` (cron setup), `send-digest` function

**Current limitation**: All users receive digest at same UTC time
- Berkeley (PST): 8:00 AM ✅
- New York (EST): 11:00 AM ❌
- Denver (MST): 9:00 AM ⚠️

**Recommendation**: Multiple cron jobs for major US timezones

**Implementation**:
```sql
-- PST users (West Coast)
SELECT cron.schedule(
  'send-digest-pst',
  '0 16 * * *',  -- 4pm UTC = 8am PST
  $$SELECT send_digest_for_timezone('America/Los_Angeles', 'America/Vancouver', 'America/Tijuana')$$
);

-- MST users (Mountain)
SELECT cron.schedule(
  'send-digest-mst',
  '0 15 * * *',  -- 3pm UTC = 8am MST
  $$SELECT send_digest_for_timezone('America/Denver', 'America/Phoenix', 'America/Boise')$$
);

-- CST users (Central)
SELECT cron.schedule(
  'send-digest-cst',
  '0 14 * * *',  -- 2pm UTC = 8am CST
  $$SELECT send_digest_for_timezone('America/Chicago', 'America/Mexico_City')$$
);

-- EST users (East Coast)
SELECT cron.schedule(
  'send-digest-est',
  '0 13 * * *',  -- 1pm UTC = 8am EST
  $$SELECT send_digest_for_timezone('America/New_York', 'America/Toronto', 'America/Detroit')$$
);
```

**Update send-digest function**:
```typescript
// Add timezone filter parameter
async function sendDigest(timezones: string[]) {
  const { data: users } = await supabase
    .from('users')
    .select('*')
    .eq('digest_enabled', true)
    .in('timezone', timezones);  // Filter by timezone

  // ... rest of logic
}
```

**Benefits**:
- Covers ~99% of US college students
- Simple to implement (no major code changes)
- Easy to add more timezones later

**Complexity**: Low (SQL + minor function update)
**Priority**: Medium (post-launch, based on user feedback)
**Status**: Planned for Phase 2 (post-launch)

---

### Phase 3: Global Timezone Support (If Going International)
**Location**: Cron setup, `send-digest` function

**Use case**: Users in any timezone worldwide

**Recommendation**: Hourly cron with smart filtering

**Implementation**:
```sql
-- Run every hour
SELECT cron.schedule(
  'send-digest-hourly',
  '0 * * * *',
  $$SELECT send_digest_hourly()$$
);
```

**Updated function logic**:
```typescript
async function sendDigestHourly() {
  // Get all enabled users
  const { data: users } = await supabase
    .from('users')
    .select('*')
    .eq('digest_enabled', true);

  const now = new Date();

  for (const user of users) {
    // Calculate user's current local hour
    const localHour = parseInt(
      now.toLocaleString('en-US', {
        hour: 'numeric',
        hour12: false,
        timeZone: user.timezone
      })
    );

    // Only process if it's 8am in their timezone
    if (localHour === 8) {
      await processUserDigest(user);
    }
  }
}
```

**Benefits**:
- Supports any timezone automatically
- No configuration per timezone
- Handles edge cases (half-hour timezones like India: UTC+5:30)

**Trade-offs**:
- Function runs 24 times/day (but most runs process 0 users)
- Slightly more database load (queries all users hourly)

**Optimization**: Add `last_digest_sent_at` column to avoid processing users multiple times in same day

**Complexity**: Medium (requires function refactor + testing)
**Priority**: Low (only if going international)
**Status**: Deferred until international expansion

---

### Future: Per-User Configurable Send Time
**Location**: Database schema, settings page UI, `send-digest` function

**Use case**: Power users want digest at 7am or 9am instead of 8am

**Recommendation**: Add user preference

**Database change**:
```sql
ALTER TABLE users ADD COLUMN preferred_send_hour INTEGER DEFAULT 8;
-- Allow 6am - 10am
ALTER TABLE users ADD CONSTRAINT check_send_hour CHECK (preferred_send_hour BETWEEN 6 AND 10);
```

**Settings page update**:
```html
<label>Digest time:</label>
<select name="send_hour">
  <option value="6">6:00 AM</option>
  <option value="7">7:00 AM</option>
  <option value="8" selected>8:00 AM</option>
  <option value="9">9:00 AM</option>
  <option value="10">10:00 AM</option>
</select>
```

**Function update**:
Combine with Phase 3 (hourly cron), but check:
```typescript
if (localHour === user.preferred_send_hour) {
  await processUserDigest(user);
}
```

**Benefits**:
- Maximum flexibility
- Accommodates different schedules (early birds vs night owls)

**Complexity**: Medium-High (requires UI + backend changes)
**Priority**: Low (nice-to-have, not core value prop)
**Status**: Deferred until user feedback indicates demand

