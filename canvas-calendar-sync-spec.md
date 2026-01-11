# Canvas Calendar Sync — Technical Implementation Spec

## Project Overview

A Chrome browser extension that syncs Canvas LMS assignments to Google Calendar with one click. Based on the architecture of [notion-assignment-import](https://github.com/JamesNZL/notion-assignment-import) (8,200+ users), but targeting Google Calendar instead of Notion.

**Week 1 MVP Goal**: User installs extension → navigates to any Canvas course page → clicks "Sync to Google Calendar" → all assignments from that course appear in their Google Calendar as events.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         BROWSER EXTENSION                               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────────────┐  │
│  │ Content      │    │ Popup UI     │    │ Background Service       │  │
│  │ Script       │    │              │    │ Worker                   │  │
│  │ (fetch.ts)   │───►│ (popup.html) │───►│ (background.ts)          │  │
│  │              │    │              │    │                          │  │
│  │ • Injected   │    │ • Shows      │    │ • Handles Google OAuth   │  │
│  │   into Canvas│    │   courses    │    │ • Creates calendar       │  │
│  │ • Fetches    │    │ • Sync       │    │   events via API         │  │
│  │   assignments│    │   button     │    │                          │  │
│  │   via API    │    │ • Status     │    │                          │  │
│  └──────────────┘    └──────────────┘    └──────────────────────────┘  │
│         │                   │                        │                  │
│         ▼                   ▼                        ▼                  │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    Browser localStorage                          │   │
│  │  • Saved assignments (by course)                                 │   │
│  │  • Google OAuth token                                            │   │
│  │  • User preferences                                              │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## File Structure

```
canvas-calendar-sync/
├── manifest.json              # Extension manifest (v3)
├── package.json               # Dependencies
├── tsconfig.json              # TypeScript config
├── src/
│   ├── popup/
│   │   ├── popup.html         # Extension popup UI
│   │   ├── popup.ts           # Popup logic
│   │   ├── popup.css          # Styles
│   │   └── fetch.ts           # Content script for Canvas API calls
│   ├── background/
│   │   └── background.ts      # Service worker for Google OAuth + Calendar API
│   ├── types/
│   │   ├── canvas.ts          # Canvas API response types
│   │   ├── calendar.ts        # Google Calendar event types
│   │   └── storage.ts         # localStorage schema types
│   └── utils/
│       ├── canvas-api.ts      # Canvas API helpers
│       ├── google-calendar.ts # Google Calendar API helpers
│       └── storage.ts         # localStorage helpers
├── assets/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── dist/                      # Build output
```

---

## Step-by-Step Implementation

### Step 1: Project Setup

```bash
# Create project
mkdir canvas-calendar-sync
cd canvas-calendar-sync
npm init -y

# Install dependencies
npm install -D typescript esbuild @types/chrome

# Create tsconfig.json
```

**tsconfig.json:**
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "node",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules"]
}
```

---

### Step 2: Manifest.json (Chrome Extension v3)

```json
{
  "manifest_version": 3,
  "name": "Canvas Calendar Sync",
  "description": "Sync Canvas LMS assignments to Google Calendar with one click",
  "version": "1.0.0",
  "permissions": [
    "identity",
    "storage",
    "activeTab",
    "scripting"
  ],
  "host_permissions": [
    "https://*.instructure.com/*",
    "https://www.googleapis.com/*"
  ],
  "oauth2": {
    "client_id": "YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com",
    "scopes": [
      "https://www.googleapis.com/auth/calendar.events"
    ]
  },
  "background": {
    "service_worker": "background.js",
    "type": "module"
  },
  "action": {
    "default_popup": "popup.html",
    "default_icon": {
      "16": "assets/icon16.png",
      "48": "assets/icon48.png",
      "128": "assets/icon128.png"
    }
  },
  "icons": {
    "16": "assets/icon16.png",
    "48": "assets/icon48.png",
    "128": "assets/icon128.png"
  },
  "content_scripts": [
    {
      "matches": ["https://*.instructure.com/courses/*"],
      "js": ["fetch.js"],
      "run_at": "document_idle"
    }
  ]
}
```

---

### Step 3: Type Definitions

**src/types/canvas.ts:**
```typescript
// Canvas API response types

export interface CanvasCourse {
  id: number;
  name: string;
  course_code: string;
  start_at: string | null;
  end_at: string | null;
}

export interface CanvasAssignment {
  id: number;
  name: string;
  description: string | null;
  due_at: string | null;           // ISO 8601 datetime
  unlock_at: string | null;        // When assignment becomes available
  lock_at: string | null;          // When assignment closes
  points_possible: number | null;
  html_url: string;                // Direct link to assignment
  submission_types: string[];
  course_id: number;
}

export interface CanvasAssignmentGroup {
  id: number;
  name: string;
  assignments: CanvasAssignment[];
}
```

**src/types/calendar.ts:**
```typescript
// Google Calendar event types

export interface CalendarEvent {
  summary: string;           // Event title
  description?: string;      // Event description (HTML supported)
  start: {
    dateTime: string;        // ISO 8601
    timeZone: string;
  };
  end: {
    dateTime: string;
    timeZone: string;
  };
  location?: string;
  source?: {
    title: string;
    url: string;             // Link back to Canvas
  };
  extendedProperties?: {
    private: {
      canvasAssignmentId: string;
      canvasCourseId: string;
    };
  };
}

export interface CalendarEventResponse {
  id: string;
  htmlLink: string;
  status: string;
}
```

**src/types/storage.ts:**
```typescript
// localStorage schema

export interface SavedAssignment {
  id: number;
  name: string;
  dueAt: string | null;
  unlockAt: string | null;
  pointsPossible: number | null;
  url: string;
  description: string | null;
  courseId: number;
  courseName: string;
  courseCode: string;
}

export interface SavedCourse {
  id: number;
  name: string;
  code: string;
  assignments: SavedAssignment[];
  fetchedAt: string;           // ISO timestamp
}

export interface StorageSchema {
  courses: Record<number, SavedCourse>;  // keyed by course ID
  googleToken?: string;
  syncedAssignments: number[];           // Assignment IDs already in Calendar
  userTimezone: string;
}
```

---

### Step 4: Canvas API Fetching (Content Script)

**src/popup/fetch.ts:**
```typescript
// Content script injected into Canvas pages
// This runs IN the Canvas tab, using the user's existing session cookies

import type { CanvasCourse, CanvasAssignment, CanvasAssignmentGroup } from '../types/canvas';
import type { SavedAssignment, SavedCourse } from '../types/storage';

// Extract course ID from URL like: https://canvas.university.edu/courses/12345/...
function getCourseIdFromUrl(): number | null {
  const match = window.location.pathname.match(/\/courses\/(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

// Get Canvas API base URL from current page
function getCanvasOrigin(): string {
  return window.location.origin;
}

// Fetch course details
async function fetchCourse(courseId: number): Promise<CanvasCourse> {
  const response = await fetch(
    `${getCanvasOrigin()}/api/v1/courses/${courseId}`,
    { credentials: 'include' }  // Include session cookies
  );
  
  if (!response.ok) {
    throw new Error(`Failed to fetch course: ${response.status}`);
  }
  
  return response.json();
}

// Fetch all assignments for a course (via assignment groups)
async function fetchAssignments(courseId: number): Promise<CanvasAssignment[]> {
  const assignments: CanvasAssignment[] = [];
  let page = 1;
  let hasMore = true;
  
  while (hasMore) {
    const response = await fetch(
      `${getCanvasOrigin()}/api/v1/courses/${courseId}/assignment_groups?` +
      `include[]=assignments&per_page=100&page=${page}`,
      { credentials: 'include' }
    );
    
    if (!response.ok) {
      throw new Error(`Failed to fetch assignments: ${response.status}`);
    }
    
    const groups: CanvasAssignmentGroup[] = await response.json();
    
    for (const group of groups) {
      if (group.assignments) {
        assignments.push(...group.assignments);
      }
    }
    
    // Check for pagination
    const linkHeader = response.headers.get('Link');
    hasMore = linkHeader?.includes('rel="next"') ?? false;
    page++;
  }
  
  return assignments;
}

// Transform Canvas assignment to our storage format
function transformAssignment(
  assignment: CanvasAssignment,
  course: CanvasCourse
): SavedAssignment {
  return {
    id: assignment.id,
    name: assignment.name,
    dueAt: assignment.due_at,
    unlockAt: assignment.unlock_at,
    pointsPossible: assignment.points_possible,
    url: assignment.html_url,
    description: assignment.description,
    courseId: course.id,
    courseName: course.name,
    courseCode: course.course_code,
  };
}

// Main function called when extension requests data
export async function fetchCourseData(): Promise<SavedCourse | null> {
  const courseId = getCourseIdFromUrl();
  
  if (!courseId) {
    console.error('Not on a Canvas course page');
    return null;
  }
  
  try {
    const [course, assignments] = await Promise.all([
      fetchCourse(courseId),
      fetchAssignments(courseId),
    ]);
    
    // Filter to assignments with due dates (optional: make configurable)
    const validAssignments = assignments.filter(a => a.due_at !== null);
    
    const savedCourse: SavedCourse = {
      id: course.id,
      name: course.name,
      code: course.course_code,
      assignments: validAssignments.map(a => transformAssignment(a, course)),
      fetchedAt: new Date().toISOString(),
    };
    
    return savedCourse;
  } catch (error) {
    console.error('Error fetching Canvas data:', error);
    throw error;
  }
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'FETCH_CANVAS_DATA') {
    fetchCourseData()
      .then(data => sendResponse({ success: true, data }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Keep channel open for async response
  }
});
```

---

### Step 5: Google Calendar Integration (Background Script)

**src/background/background.ts:**
```typescript
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

// Strip HTML tags from description
function stripHtml(html: string): string {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.textContent || div.innerText || '';
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
    // Skip assignments without due dates
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
```

---

### Step 6: Popup UI

**src/popup/popup.html:**
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Canvas Calendar Sync</title>
  <link rel="stylesheet" href="popup.css">
</head>
<body>
  <div class="container">
    <header>
      <h1>📅 Canvas Calendar Sync</h1>
    </header>
    
    <!-- Auth Section -->
    <section id="auth-section" class="hidden">
      <p>Connect your Google Calendar to sync assignments</p>
      <button id="auth-btn" class="primary-btn">
        Connect Google Calendar
      </button>
    </section>
    
    <!-- Main Section (shown when authenticated) -->
    <section id="main-section" class="hidden">
      <!-- Current Course -->
      <div id="current-course" class="card hidden">
        <h2 id="course-name">Loading...</h2>
        <p id="course-code"></p>
        <p id="assignment-count"></p>
        <button id="fetch-btn" class="secondary-btn">
          Refresh Assignments
        </button>
      </div>
      
      <!-- No Course Warning -->
      <div id="no-course" class="card warning hidden">
        <p>⚠️ Navigate to a Canvas course page to sync assignments</p>
      </div>
      
      <!-- Assignment List -->
      <div id="assignments-section" class="hidden">
        <h3>Assignments to Sync</h3>
        <ul id="assignment-list"></ul>
        
        <button id="sync-btn" class="primary-btn">
          Sync to Google Calendar
        </button>
      </div>
      
      <!-- Status -->
      <div id="status" class="hidden"></div>
      
      <!-- Saved Courses -->
      <div id="saved-courses" class="hidden">
        <h3>Saved Courses</h3>
        <ul id="course-list"></ul>
      </div>
    </section>
    
    <!-- Footer -->
    <footer>
      <button id="logout-btn" class="text-btn hidden">Disconnect</button>
    </footer>
  </div>
  
  <script src="popup.js" type="module"></script>
</body>
</html>
```

**src/popup/popup.css:**
```css
* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  width: 350px;
  min-height: 400px;
  background: #f5f5f5;
}

.container {
  padding: 16px;
}

header {
  text-align: center;
  margin-bottom: 16px;
}

header h1 {
  font-size: 18px;
  color: #333;
}

.hidden {
  display: none !important;
}

.card {
  background: white;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 12px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
}

.card h2 {
  font-size: 16px;
  margin-bottom: 4px;
}

.card p {
  font-size: 14px;
  color: #666;
  margin-bottom: 8px;
}

.warning {
  background: #fff3cd;
  border: 1px solid #ffc107;
}

.primary-btn {
  width: 100%;
  padding: 12px 16px;
  background: #4285f4;
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s;
}

.primary-btn:hover {
  background: #3367d6;
}

.primary-btn:disabled {
  background: #ccc;
  cursor: not-allowed;
}

.secondary-btn {
  padding: 8px 12px;
  background: #f1f3f4;
  color: #333;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 13px;
  cursor: pointer;
}

.text-btn {
  background: none;
  border: none;
  color: #666;
  font-size: 13px;
  cursor: pointer;
  text-decoration: underline;
}

#assignment-list {
  list-style: none;
  max-height: 200px;
  overflow-y: auto;
  margin-bottom: 12px;
}

#assignment-list li {
  padding: 8px;
  border-bottom: 1px solid #eee;
  font-size: 13px;
}

#assignment-list li:last-child {
  border-bottom: none;
}

.due-date {
  color: #666;
  font-size: 12px;
}

#status {
  padding: 12px;
  border-radius: 6px;
  margin-bottom: 12px;
  font-size: 14px;
}

#status.success {
  background: #d4edda;
  color: #155724;
}

#status.error {
  background: #f8d7da;
  color: #721c24;
}

#status.loading {
  background: #e2e3e5;
  color: #383d41;
}

footer {
  text-align: center;
  margin-top: 16px;
}
```

**src/popup/popup.ts:**
```typescript
// Popup UI logic

import type { SavedCourse, SavedAssignment, StorageSchema } from '../types/storage';

// DOM Elements
const authSection = document.getElementById('auth-section')!;
const mainSection = document.getElementById('main-section')!;
const authBtn = document.getElementById('auth-btn')!;
const logoutBtn = document.getElementById('logout-btn')!;
const currentCourse = document.getElementById('current-course')!;
const noCourse = document.getElementById('no-course')!;
const courseName = document.getElementById('course-name')!;
const courseCode = document.getElementById('course-code')!;
const assignmentCount = document.getElementById('assignment-count')!;
const fetchBtn = document.getElementById('fetch-btn')!;
const assignmentsSection = document.getElementById('assignments-section')!;
const assignmentList = document.getElementById('assignment-list')!;
const syncBtn = document.getElementById('sync-btn')!;
const status = document.getElementById('status')!;

// State
let currentCourseData: SavedCourse | null = null;
let isAuthenticated = false;

// Initialize popup
async function init() {
  // Check if authenticated
  const token = await checkAuth();
  isAuthenticated = !!token;
  
  if (isAuthenticated) {
    showMainSection();
    await checkCurrentPage();
    loadSavedCourses();
  } else {
    showAuthSection();
  }
}

// Check if user has valid auth token
async function checkAuth(): Promise<string | null> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'AUTHENTICATE' }, (response) => {
      resolve(response?.success ? response.token : null);
    });
  });
}

// Show auth section
function showAuthSection() {
  authSection.classList.remove('hidden');
  mainSection.classList.add('hidden');
  logoutBtn.classList.add('hidden');
}

// Show main section
function showMainSection() {
  authSection.classList.add('hidden');
  mainSection.classList.remove('hidden');
  logoutBtn.classList.remove('hidden');
}

// Check if current tab is a Canvas course page
async function checkCurrentPage() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  if (!tab?.url?.includes('/courses/')) {
    noCourse.classList.remove('hidden');
    currentCourse.classList.add('hidden');
    assignmentsSection.classList.add('hidden');
    return;
  }
  
  noCourse.classList.add('hidden');
  currentCourse.classList.remove('hidden');
  
  // Try to fetch course data
  await fetchCourseData();
}

// Fetch course data from Canvas
async function fetchCourseData() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  if (!tab?.id) return;
  
  showStatus('Fetching assignments...', 'loading');
  
  chrome.tabs.sendMessage(
    tab.id,
    { type: 'FETCH_CANVAS_DATA' },
    (response) => {
      if (response?.success && response.data) {
        currentCourseData = response.data;
        displayCourseData(response.data);
        saveCourse(response.data);
        hideStatus();
      } else {
        showStatus('Failed to fetch: ' + (response?.error || 'Unknown error'), 'error');
      }
    }
  );
}

// Display course data in popup
function displayCourseData(course: SavedCourse) {
  courseName.textContent = course.name;
  courseCode.textContent = course.code;
  assignmentCount.textContent = `${course.assignments.length} assignments found`;
  
  // Show assignments list
  assignmentsSection.classList.remove('hidden');
  assignmentList.innerHTML = '';
  
  const sortedAssignments = [...course.assignments].sort((a, b) => {
    if (!a.dueAt) return 1;
    if (!b.dueAt) return -1;
    return new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime();
  });
  
  for (const assignment of sortedAssignments) {
    const li = document.createElement('li');
    const dueDate = assignment.dueAt 
      ? new Date(assignment.dueAt).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        })
      : 'No due date';
    
    li.innerHTML = `
      <div>${assignment.name}</div>
      <div class="due-date">Due: ${dueDate}</div>
    `;
    assignmentList.appendChild(li);
  }
}

// Save course to storage
async function saveCourse(course: SavedCourse) {
  const storage = await chrome.storage.local.get('courses');
  const courses = storage.courses || {};
  courses[course.id] = course;
  await chrome.storage.local.set({ courses });
}

// Load saved courses
async function loadSavedCourses() {
  const storage = await chrome.storage.local.get('courses');
  // TODO: Display saved courses list
}

// Sync to Google Calendar
async function syncToCalendar() {
  if (!currentCourseData) return;
  
  const assignmentsToSync = currentCourseData.assignments.filter(a => a.dueAt);
  
  if (assignmentsToSync.length === 0) {
    showStatus('No assignments with due dates to sync', 'error');
    return;
  }
  
  syncBtn.disabled = true;
  showStatus(`Syncing ${assignmentsToSync.length} assignments...`, 'loading');
  
  // Get user's timezone
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  
  chrome.runtime.sendMessage(
    {
      type: 'SYNC_TO_CALENDAR',
      assignments: assignmentsToSync,
      timezone,
    },
    (response) => {
      syncBtn.disabled = false;
      
      if (response?.success) {
        const { success, failed, errors } = response.results;
        if (failed === 0) {
          showStatus(`✅ Synced ${success} assignments to Google Calendar!`, 'success');
        } else {
          showStatus(`Synced ${success}, failed ${failed}. Check console for details.`, 'error');
          console.error('Sync errors:', errors);
        }
      } else {
        showStatus('Sync failed: ' + (response?.error || 'Unknown error'), 'error');
      }
    }
  );
}

// Logout
async function logout() {
  chrome.runtime.sendMessage({ type: 'LOGOUT' }, () => {
    isAuthenticated = false;
    showAuthSection();
  });
}

// Show status message
function showStatus(message: string, type: 'success' | 'error' | 'loading') {
  status.textContent = message;
  status.className = type;
  status.classList.remove('hidden');
}

// Hide status message
function hideStatus() {
  status.classList.add('hidden');
}

// Event listeners
authBtn.addEventListener('click', async () => {
  const token = await checkAuth();
  if (token) {
    isAuthenticated = true;
    showMainSection();
    await checkCurrentPage();
  }
});

fetchBtn.addEventListener('click', fetchCourseData);
syncBtn.addEventListener('click', syncToCalendar);
logoutBtn.addEventListener('click', logout);

// Initialize
init();
```

---

### Step 7: Build Script

**package.json:**
```json
{
  "name": "canvas-calendar-sync",
  "version": "1.0.0",
  "scripts": {
    "build": "node build.js",
    "watch": "node build.js --watch",
    "dev": "npm run watch"
  },
  "devDependencies": {
    "@types/chrome": "^0.0.254",
    "esbuild": "^0.19.0",
    "typescript": "^5.3.0"
  }
}
```

**build.js:**
```javascript
const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const isWatch = process.argv.includes('--watch');

// Ensure dist directory exists
if (!fs.existsSync('dist')) {
  fs.mkdirSync('dist');
}

// Copy static files
fs.copyFileSync('manifest.json', 'dist/manifest.json');
fs.copyFileSync('src/popup/popup.html', 'dist/popup.html');
fs.copyFileSync('src/popup/popup.css', 'dist/popup.css');

// Copy assets
if (!fs.existsSync('dist/assets')) {
  fs.mkdirSync('dist/assets');
}
// TODO: Copy icon files

// Build options
const buildOptions = {
  bundle: true,
  minify: !isWatch,
  sourcemap: isWatch,
  target: ['chrome90'],
  format: 'esm',
};

// Build files
async function build() {
  // Background script
  await esbuild.build({
    ...buildOptions,
    entryPoints: ['src/background/background.ts'],
    outfile: 'dist/background.js',
  });

  // Popup script
  await esbuild.build({
    ...buildOptions,
    entryPoints: ['src/popup/popup.ts'],
    outfile: 'dist/popup.js',
  });

  // Content script (fetch)
  await esbuild.build({
    ...buildOptions,
    entryPoints: ['src/popup/fetch.ts'],
    outfile: 'dist/fetch.js',
  });

  console.log('Build complete!');
}

if (isWatch) {
  // Watch mode
  const ctx = esbuild.context(buildOptions);
  ctx.then(c => c.watch());
  console.log('Watching for changes...');
} else {
  build();
}
```

---

## Google Cloud Console Setup (One-time)

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create new project: "Canvas Calendar Sync"
3. Enable **Google Calendar API**
4. Configure OAuth consent screen:
   - User Type: External
   - App name: "Canvas Calendar Sync"
   - Add scope: `https://www.googleapis.com/auth/calendar.events`
5. Create OAuth 2.0 credentials:
   - Application type: **Chrome Extension**
   - Item ID: Your extension ID (get from `chrome://extensions` after loading unpacked)
6. Copy Client ID to `manifest.json`

---

## Testing Checklist

- [ ] Extension loads without errors
- [ ] Auth flow works (Google OAuth popup)
- [ ] Navigating to Canvas course page triggers content script
- [ ] "Refresh Assignments" fetches data from Canvas API
- [ ] Assignments display correctly in popup
- [ ] "Sync to Google Calendar" creates events
- [ ] Events appear with correct title format: `[COURSE_CODE] Assignment Name`
- [ ] Events have correct due date/time
- [ ] Events include Canvas link in description
- [ ] Duplicate sync doesn't create duplicate events
- [ ] Logout clears auth token

---

## Future Enhancements (Week 2+)

1. **Multi-calendar support**: Let user choose which calendar
2. **Selective sync**: Checkboxes to choose which assignments to sync
3. **Apple Calendar**: Generate `.ics` file download
4. **Notion Calendar**: Add as export option
5. **Morning digest backend**: Add server component for daily notifications
6. **Custom site scraping**: LLM-based extraction for non-Canvas sites

---

## Prompts for Vibe Coding Tool

Use these prompts with Cursor/Claude Code:

**Initial setup:**
> "Create a Chrome extension project with TypeScript and esbuild. Set up the file structure shown in the spec. Initialize with manifest v3."

**Canvas fetching:**
> "Implement the content script that fetches course data from Canvas LMS API. Use the existing session cookies for auth. Extract course ID from URL, fetch course details and assignments from /api/v1/courses/:id and /api/v1/courses/:id/assignment_groups endpoints."

**Google Calendar integration:**
> "Implement Google OAuth using chrome.identity API and create calendar events using Google Calendar REST API. Include deduplication by storing canvas assignment ID in event extendedProperties."

**UI:**
> "Create the popup UI with sections for: auth prompt, current course display, assignment list, sync button, and status messages. Style with clean, minimal CSS."
