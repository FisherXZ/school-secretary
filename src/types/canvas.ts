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

