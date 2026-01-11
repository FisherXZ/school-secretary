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

