# school-secretary

Chrome extension that syncs Canvas LMS assignments to Google Calendar and sends daily morning digest emails.

## Features

### Layer 1: Calendar Sync (Implemented)
- ✅ One-click sync of Canvas assignments to Google Calendar
- ✅ Syncs assignment due dates, descriptions, and links
- ✅ Updates existing events if assignments change
- ✅ Works with Canvas and bCourses (Berkeley)

### Layer 2: Morning Digest (This Implementation)
- 📬 Daily 8am email with homework due today and this week
- ⏰ Automatic timezone detection
- 🔕 Easy unsubscribe
- ⚙️ Settings page to toggle on/off

## Quick Start

### For Users

1. Install the Chrome extension
2. Navigate to a Canvas course page
3. Click the extension icon
4. Click "Connect Google Calendar"
5. Click "Enable Digest" to get daily emails (optional)

### For Developers

See deployment guides in `docs/`:
- **Layer 1:** See `canvas-calendar-sync-spec.md`
- **Layer 2:** See `docs/MORNING_DIGEST_DEPLOYMENT.md`

## Documentation

- **[Morning Digest Deployment Guide](docs/MORNING_DIGEST_DEPLOYMENT.md)** - Step-by-step setup
- **[Architecture Overview](docs/MORNING_DIGEST_ARCHITECTURE.md)** - Technical details
- **[Quick Reference](docs/QUICK_REFERENCE.md)** - Common commands and troubleshooting

## Project Structure

```
school-secretary/
├── src/
│   ├── popup/           # Extension UI
│   ├── background/      # Background service worker
│   └── types/           # TypeScript types
├── supabase/
│   ├── schema.sql       # Database schema
│   └── functions/       # Edge Functions (digest backend)
├── docs/                # Documentation
├── manifest.json        # Extension manifest
└── build.js             # Build script
```

## Tech Stack

**Frontend (Extension):**
- TypeScript
- Chrome Extensions API
- Google Calendar API

**Backend (Digest):**
- Supabase (Postgres + Edge Functions)
- Deno runtime
- Resend (email delivery)
- pg_cron (scheduled jobs)

## Development

```bash
# Install dependencies
npm install

# Build extension
npm run build

# Watch mode
npm run dev
```

## Deployment

### Extension
Load unpacked extension from root directory in Chrome.

### Backend
Follow [MORNING_DIGEST_DEPLOYMENT.md](docs/MORNING_DIGEST_DEPLOYMENT.md) for complete Supabase setup.

## License

MIT

## Support

For issues or questions, see the documentation in `docs/` or check:
- Supabase logs: Dashboard → Edge Functions → Logs
- Extension console: Right-click extension → Inspect
- Email delivery: Resend Dashboard → Logs
