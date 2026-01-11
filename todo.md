# Canvas Calendar Sync - Future Enhancements

## Assignment Handling

### Handle Assignments Without Due Dates
**Location**: `src/background/background.ts:143`

Currently, assignments without due dates are skipped during sync. Future enhancement should:
- Allow users to optionally sync assignments without due dates
- Provide UI option to choose how to handle these (skip, sync with custom date, etc.)
- Consider creating all-day events or events with flexible dates for assignments without due dates

**Status**: Deferred for MVP

