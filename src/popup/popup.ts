// Popup UI logic

import type { SavedCourse, SavedAssignment, StorageSchema } from '../types/storage';

// DOM Elements
const authSection = document.getElementById('auth-section')!;
const mainSection = document.getElementById('main-section')!;
const authBtn = document.getElementById('auth-btn')!;
const logoutBtn = document.getElementById('logout-btn')!;
const digestSection = document.getElementById('digest-section')!;
const userEmailEl = document.getElementById('user-email')!;
const digestSignup = document.getElementById('digest-signup')!;
const digestEnabled = document.getElementById('digest-enabled')!;
const enableDigestBtn = document.getElementById('enable-digest-btn')! as HTMLButtonElement;
const skipDigestBtn = document.getElementById('skip-digest-btn')!;
const digestSettingsBtn = document.getElementById('digest-settings-btn')!;
const currentCourse = document.getElementById('current-course')!;
const noCourse = document.getElementById('no-course')!;
const courseName = document.getElementById('course-name')!;
const courseCode = document.getElementById('course-code')!;
const assignmentCount = document.getElementById('assignment-count')!;
const fetchBtn = document.getElementById('fetch-btn')! as HTMLButtonElement;
const assignmentsSection = document.getElementById('assignments-section')!;
const assignmentList = document.getElementById('assignment-list')!;
const syncBtn = document.getElementById('sync-btn')! as HTMLButtonElement;
const status = document.getElementById('status')!;

// Supabase config
// TODO: Replace these with your actual Supabase credentials from the Supabase dashboard
const SUPABASE_URL = 'https://qguiewlbiopbsgfzpcrt.supabase.co'; // e.g., 'https://abcdefghij.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFndWlld2xiaW9wYnNnZnpwY3J0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgxNjUyOTAsImV4cCI6MjA4Mzc0MTI5MH0.YBxCYHVOnw-KmSF6-GUMSu4HyG2QVC3KdtlkgREkBLg'; // Get from Settings → API

// Google OAuth config (from manifest.json)
const GOOGLE_CLIENT_ID = '862922347346-q22513216dpmfuu54pp0vdp9jgengarc.apps.googleusercontent.com';

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
    await showDigestSignup(); // Show digest signup if applicable
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

// ============================================================================
// Digest Functionality
// ============================================================================

// Get user's email from Google
async function getUserEmail(token: string): Promise<string | null> {
  try {
    const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { 'Authorization': `Bearer ${token}` },
    });

    if (!response.ok) return null;

    const data = await response.json();
    return data.email || null;
  } catch (error) {
    console.error('Error fetching user email:', error);
    return null;
  }
}

// Show digest signup prompt
async function showDigestSignup() {
  // Check if user already skipped or enabled digest
  const storage = await chrome.storage.local.get(['digestSkipped', 'digestEnabled']);

  if (storage.digestSkipped || storage.digestEnabled) {
    // Already made a choice, don't show again
    if (storage.digestEnabled) {
      // Show that digest is enabled
      digestSection.classList.remove('hidden');
      digestSignup.classList.add('hidden');
      digestEnabled.classList.remove('hidden');
    }
    return;
  }

  // Get user's email
  const token = await checkAuth();
  if (!token) return;

  const email = await getUserEmail(token);
  if (!email) return;

  // Show the signup section
  digestSection.classList.remove('hidden');
  userEmailEl.textContent = email;

  // Store email temporarily for signup
  await chrome.storage.local.set({
    pendingDigestSignup: { email, token }
  });

  // Check if user already exists in database
  const exists = await checkExistingUser(email);
  if (exists) {
    digestSignup.classList.add('hidden');
    digestEnabled.classList.remove('hidden');
    await chrome.storage.local.set({ digestEnabled: true, digestEmail: email });
  }
}

// Check if user already exists in Supabase
async function checkExistingUser(email: string): Promise<boolean> {
  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/users?email=eq.${encodeURIComponent(email)}&select=id,digest_enabled`,
      {
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        },
      }
    );

    if (!response.ok) return false;

    const data = await response.json();
    return data.length > 0 && data[0].digest_enabled === true;
  } catch (error) {
    console.error('Error checking existing user:', error);
    return false;
  }
}

// Enable digest signup
async function enableDigest() {
  enableDigestBtn.disabled = true;
  enableDigestBtn.textContent = 'Enabling...';

  const storage = await chrome.storage.local.get('pendingDigestSignup');
  const { email, token } = storage.pendingDigestSignup;

  if (!email || !token) {
    alert('Error: Missing authentication. Please try reconnecting your Google Calendar.');
    enableDigestBtn.disabled = false;
    enableDigestBtn.textContent = 'Enable Digest';
    return;
  }

  try {
    // Get user's timezone from Google Calendar
    const timezone = await fetchGoogleTimezone(token);

    // TODO: Get refresh token for backend access
    // NOTE: chrome.identity.getAuthToken() only provides access tokens, not refresh tokens.
    // For the digest feature to work, we need a refresh token that the backend can use.
    // This requires implementing a full OAuth2 flow with chrome.identity.launchWebAuthFlow.
    // For now, we'll pass the access token, but this will need to be updated.
    // See: https://developer.chrome.com/docs/extensions/reference/identity/
    const refreshToken = token; // FIXME: This should be a real refresh token

    // Call Supabase signup function
    const response = await fetch(`${SUPABASE_URL}/functions/v1/signup-user`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        email,
        google_refresh_token: refreshToken,
        timezone,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Signup failed');
    }

    const responseData = await response.json();

    // Success - update UI
    digestSignup.classList.add('hidden');
    digestEnabled.classList.remove('hidden');

    // Store that user has digest enabled
    await chrome.storage.local.set({
      digestEnabled: true,
      digestEmail: email,
      digestUserId: responseData.user_id,
    });

    // Clean up pending signup
    await chrome.storage.local.remove('pendingDigestSignup');

  } catch (error) {
    console.error('Error enabling digest:', error);
    enableDigestBtn.disabled = false;
    enableDigestBtn.textContent = 'Enable Digest';
    alert('Failed to enable digest. Please try again. Error: ' + (error as Error).message);
  }
}

// Fetch timezone from Google Calendar settings
async function fetchGoogleTimezone(token: string): Promise<string> {
  try {
    const response = await fetch(
      'https://www.googleapis.com/calendar/v3/users/me/settings/timezone',
      {
        headers: { 'Authorization': `Bearer ${token}` },
      }
    );

    if (!response.ok) {
      console.error('Failed to fetch timezone, using default');
      return 'America/Los_Angeles';
    }

    const data = await response.json();
    return data.value || 'America/Los_Angeles';
  } catch (error) {
    console.error('Error fetching timezone:', error);
    return 'America/Los_Angeles'; // Fallback
  }
}

// Skip digest
async function skipDigest() {
  digestSection.classList.add('hidden');
  await chrome.storage.local.set({ digestSkipped: true });
  await chrome.storage.local.remove('pendingDigestSignup');
}

// Open settings page
async function openDigestSettings() {
  const storage = await chrome.storage.local.get(['digestUserId']);
  const userId = storage.digestUserId;

  if (userId) {
    chrome.tabs.create({
      url: `${SUPABASE_URL}/functions/v1/settings-page?id=${userId}`
    });
  } else {
    // Fallback - open without ID
    chrome.tabs.create({
      url: `${SUPABASE_URL}/functions/v1/settings-page`
    });
  }
}

// Event listeners
authBtn.addEventListener('click', async () => {
  const token = await checkAuth();
  if (token) {
    isAuthenticated = true;
    showMainSection();
    await showDigestSignup(); // Show digest signup after auth
    await checkCurrentPage();
  }
});

fetchBtn.addEventListener('click', fetchCourseData);
syncBtn.addEventListener('click', syncToCalendar);
logoutBtn.addEventListener('click', logout);

// Digest event listeners
enableDigestBtn.addEventListener('click', enableDigest);
skipDigestBtn.addEventListener('click', skipDigest);
digestSettingsBtn.addEventListener('click', openDigestSettings);

// Initialize
init();

