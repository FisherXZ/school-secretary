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

