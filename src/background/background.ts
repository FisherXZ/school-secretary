// Background service worker
// Handles Google OAuth and Calendar API calls

import type { CalendarEvent, CalendarEventResponse } from '../types/calendar';
import type { SavedAssignment } from '../types/storage';

// Get OAuth token using Chrome Identity API
async function getAuthToken(interactive: boolean = true): Promise<string> {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive }, (token) => {
      if (chrome.runtime.lastError || !token) {
        reject(new Error(chrome.runtime.lastError?.message || 'Failed to get auth token'));
      } else {
        resolve(token);
      }
    });
  });
}

// Remove cached auth token (for re-auth)
async function removeCachedToken(token: string): Promise<void> {
  return new Promise((resolve) => {
    chrome.identity.removeCachedAuthToken({ token }, resolve);
  });
}

// Check if an assignment is already synced (by checking extendedProperties)
async function findExistingEvent(
  token: string,
  assignmentId: number
): Promise<string | null> {
  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?` +
    `privateExtendedProperty=canvasAssignmentId=${assignmentId}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  
  if (!response.ok) return null;
  
  const data = await response.json();
  return data.items?.[0]?.id ?? null;
}

// Strip HTML tags from description (using regex since service workers don't have DOM)
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').trim();
}

// Create a calendar event from a Canvas assignment
function assignmentToCalendarEvent(
  assignment: SavedAssignment,
  timezone: string
): CalendarEvent {
  // Default event duration: 1 hour before due time
  const dueDate = new Date(assignment.dueAt!);
  const startDate = new Date(dueDate.getTime() - 60 * 60 * 1000); // 1 hour before
  
  // Build description with assignment details
  const descriptionParts = [
    `📚 Course: ${assignment.courseCode} - ${assignment.courseName}`,
    assignment.pointsPossible ? `📊 Points: ${assignment.pointsPossible}` : null,
    `🔗 Canvas Link: ${assignment.url}`,
    '',
    assignment.description ? '---' : null,
    assignment.description ? stripHtml(assignment.description) : null,
  ].filter(Boolean);
  
  return {
    summary: `[${assignment.courseCode}] ${assignment.name}`,
    description: descriptionParts.join('\n'),
    start: {
      dateTime: startDate.toISOString(),
      timeZone: timezone,
    },
    end: {
      dateTime: dueDate.toISOString(),
      timeZone: timezone,
    },
    source: {
      title: 'Canvas Assignment',
      url: assignment.url,
    },
    extendedProperties: {
      private: {
        canvasAssignmentId: String(assignment.id),
        canvasCourseId: String(assignment.courseId),
      },
    },
  };
}

// Create or update a calendar event
async function syncAssignmentToCalendar(
  token: string,
  assignment: SavedAssignment,
  timezone: string
): Promise<CalendarEventResponse> {
  // Check if already synced
  const existingEventId = await findExistingEvent(token, assignment.id);
  
  const event = assignmentToCalendarEvent(assignment, timezone);
  
  const url = existingEventId
    ? `https://www.googleapis.com/calendar/v3/calendars/primary/events/${existingEventId}`
    : `https://www.googleapis.com/calendar/v3/calendars/primary/events`;
  
  const method = existingEventId ? 'PUT' : 'POST';
  
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(event),
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Calendar API error: ${error.error?.message || response.status}`);
  }
  
  return response.json();
}

// Sync all assignments from a course
async function syncCourseToCalendar(
  assignments: SavedAssignment[],
  timezone: string
): Promise<{ success: number; failed: number; errors: string[] }> {
  const token = await getAuthToken();
  
  const results = {
    success: 0,
    failed: 0,
    errors: [] as string[],
  };
  
  for (const assignment of assignments) {
    // TODO: Skip assignments without due dates for now
    // See todo.md for future enhancement to handle assignments without due dates
    if (!assignment.dueAt) continue;
    
    try {
      await syncAssignmentToCalendar(token, assignment, timezone);
      results.success++;
    } catch (error) {
      results.failed++;
      results.errors.push(`${assignment.name}: ${(error as Error).message}`);
    }
    
    // Rate limiting: small delay between requests
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  return results;
}

// Message handler
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'AUTHENTICATE':
      getAuthToken(true)
        .then(token => sendResponse({ success: true, token }))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;
    
    case 'SYNC_TO_CALENDAR':
      syncCourseToCalendar(message.assignments, message.timezone)
        .then(results => sendResponse({ success: true, results }))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;
    
    case 'LOGOUT':
      getAuthToken(false)
        .then(token => removeCachedToken(token))
        .then(() => sendResponse({ success: true }))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;
  }
});

