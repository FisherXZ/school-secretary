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

