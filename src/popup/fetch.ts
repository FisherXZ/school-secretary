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

