import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID')!;
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET')!;
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;

interface User {
  id: string;
  email: string;
  google_refresh_token: string;
  google_access_token: string | null;
  token_expires_at: string | null;
  timezone: string;
  digest_enabled: boolean;
}

interface CalendarEvent {
  summary: string;
  start: {
    dateTime?: string;
    date?: string;
  };
  source?: {
    url?: string;
  };
  extendedProperties?: {
    private?: {
      canvasAssignmentId?: string;
      canvasCourseId?: string;
    };
  };
}

serve(async (req) => {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Get all users with digest enabled
    const { data: users, error } = await supabase
      .from('users')
      .select('*')
      .eq('digest_enabled', true);

    if (error) {
      console.error('Database error:', error);
      return new Response(
        JSON.stringify({ error: 'Database error', details: error.message }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Processing ${users.length} users`);

    let successCount = 0;
    let failCount = 0;
    const errors: string[] = [];

    for (const user of users) {
      try {
        await processUserDigest(user as User, supabase);
        successCount++;
        console.log(`✓ Processed user: ${user.email}`);
      } catch (error) {
        console.error(`✗ Error processing user ${user.email}:`, error);
        failCount++;
        errors.push(`${user.email}: ${(error as Error).message}`);
      }
    }

    const result = {
      success: true,
      processed: successCount,
      failed: failCount,
      total: users.length,
      errors: errors.length > 0 ? errors : undefined,
    };

    console.log('Digest run complete:', result);

    return new Response(
      JSON.stringify(result),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Fatal error in send-digest:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: (error as Error).message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});

async function processUserDigest(user: User, supabase: any) {
  // Step 1: Get fresh access token
  const accessToken = await refreshAccessToken(user, supabase);

  // Step 2: Fetch calendar events for next 7 days
  const events = await fetchCalendarEvents(accessToken, user.timezone);

  // Step 3: Filter to homework only (events with our tags)
  const homework = filterHomeworkEvents(events);

  // Step 4: Group into today vs this week
  const { today, thisWeek } = groupEventsByDate(homework, user.timezone);

  // Step 5: Build and send email
  await sendDigestEmail(user.email, user.id, today, thisWeek, user.timezone);
}

async function refreshAccessToken(user: User, supabase: any): Promise<string> {
  // Check if current token is still valid
  if (user.google_access_token && user.token_expires_at) {
    const expiresAt = new Date(user.token_expires_at);
    const now = new Date();
    const bufferTime = 60000; // 1 minute buffer

    if (expiresAt.getTime() > now.getTime() + bufferTime) {
      // Token still valid
      return user.google_access_token;
    }
  }

  // Refresh the token
  console.log(`Refreshing access token for ${user.email}`);

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: user.google_refresh_token,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token refresh failed (${response.status}): ${error}`);
  }

  const data = await response.json();

  if (!data.access_token) {
    throw new Error('No access token in refresh response');
  }

  // Cache the new token
  const expiresAt = new Date(Date.now() + data.expires_in * 1000);
  await supabase
    .from('users')
    .update({
      google_access_token: data.access_token,
      token_expires_at: expiresAt.toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', user.id);

  return data.access_token;
}

async function fetchCalendarEvents(accessToken: string, timezone: string): Promise<CalendarEvent[]> {
  const now = new Date();
  const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const url = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events');
  url.searchParams.set('timeMin', now.toISOString());
  url.searchParams.set('timeMax', weekFromNow.toISOString());
  url.searchParams.set('singleEvents', 'true');
  url.searchParams.set('orderBy', 'startTime');
  url.searchParams.set('timeZone', timezone);

  const response = await fetch(url.toString(), {
    headers: { 'Authorization': `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Calendar fetch failed (${response.status}): ${error}`);
  }

  const data = await response.json();
  return data.items || [];
}

function filterHomeworkEvents(events: CalendarEvent[]): CalendarEvent[] {
  return events.filter(event => {
    // Check for our hidden tag
    const privateProps = event.extendedProperties?.private;
    return privateProps?.canvasAssignmentId != null;
  });
}

function groupEventsByDate(
  events: CalendarEvent[],
  timezone: string
): { today: CalendarEvent[]; thisWeek: CalendarEvent[] } {
  const now = new Date();

  // Get today's date in user's timezone (YYYY-MM-DD format)
  const todayStr = now.toLocaleDateString('en-CA', { timeZone: timezone });

  const today: CalendarEvent[] = [];
  const thisWeek: CalendarEvent[] = [];

  for (const event of events) {
    const eventDate = event.start.dateTime || event.start.date;
    if (!eventDate) continue;

    // Get event date in user's timezone (YYYY-MM-DD format)
    const eventDateStr = new Date(eventDate).toLocaleDateString('en-CA', { timeZone: timezone });

    if (eventDateStr === todayStr) {
      today.push(event);
    } else {
      thisWeek.push(event);
    }
  }

  return { today, thisWeek };
}

async function sendDigestEmail(
  email: string,
  userId: string,
  today: CalendarEvent[],
  thisWeek: CalendarEvent[],
  timezone: string
) {
  const now = new Date();
  const dayName = now.toLocaleDateString('en-US', { weekday: 'long', timeZone: timezone });
  const monthDay = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: timezone });

  // Build email content
  let body = `Good morning!\n\n`;

  // TODAY section
  body += `━━━━━━━━━━━━━━━━━━━━\nTODAY\n━━━━━━━━━━━━━━━━━━━━\n\n`;

  if (today.length === 0) {
    body += `Nothing due today — enjoy your day! 🎉\n`;
  } else {
    for (const event of today) {
      const time = formatEventTime(event, timezone);
      const canvasUrl = event.source?.url || '';
      body += `⚠️  ${event.summary} — due ${time}\n`;
      if (canvasUrl) {
        body += `   → ${canvasUrl}\n`;
      }
      body += `\n`;
    }
  }

  // THIS WEEK section
  body += `\n━━━━━━━━━━━━━━━━━━━━\nTHIS WEEK\n━━━━━━━━━━━━━━━━━━━━\n\n`;

  if (thisWeek.length === 0) {
    body += `Nothing else this week.\n`;
  } else {
    for (const event of thisWeek) {
      const eventDate = new Date(event.start.dateTime || event.start.date!);
      const dayAbbrev = eventDate.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        timeZone: timezone,
      });
      body += `${dayAbbrev} · ${event.summary}\n`;
    }
  }

  // Footer
  const unsubscribeUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/unsubscribe?id=${userId}`;
  body += `\n━━━━━━━━━━━━━━━━━━━━\n\nHave a focused day.\n\n—school-secretary\n\nUnsubscribe: ${unsubscribeUrl}`;

  // Send via Resend
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'school-secretary <digest@yourdomain.com>', // TODO: Update with your verified domain
      to: email,
      subject: `📅 Your ${dayName}, ${monthDay}`,
      text: body,
    }),
  });

  if (!response.ok) {
    const errorData = await response.text();
    throw new Error(`Email send failed (${response.status}): ${errorData}`);
  }

  console.log(`Email sent to ${email}: ${today.length} today, ${thisWeek.length} this week`);
}

function formatEventTime(event: CalendarEvent, timezone: string): string {
  if (!event.start.dateTime) {
    return 'all day';
  }

  try {
    const date = new Date(event.start.dateTime);
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: timezone,
    });
  } catch {
    return 'time unknown';
  }
}
