# Canvas Calendar Sync — Product Roadmap

## The Problem
Students forget assignments because information is scattered across Canvas, professor websites, and their own calendars. The friction of manually tracking deadlines causes missed work.

## The Insight
Successful student tools (Coursicle, Notion Canvas Import) do **one thing perfectly** and integrate into existing workflows. Failed tools (MyEdu) tried to be a destination. We're building a pipe, not a platform.

---

## Product Layers

### Layer 1: One-Click Calendar Sync (Week 1)
**What it does:** Browser extension syncs Canvas assignments to Google Calendar instantly.

**Why it matters:** Removes friction entirely. Student's calendar becomes the single source of truth without behavior change.

**Success metric:** User installs → syncs first course in under 60 seconds.

---

### Layer 2: Morning Digest (Week 2-3)
**What it does:** Daily 7am text/email: "Today: Data 101 HW due 5pm → [assignment link] [lecture slides]"

**Why it matters:** This is what elite executive assistants do — information comes TO you, pre-filtered and actionable. Calendar sync is passive; digest is active.

**Success metric:** User opens digest → clicks through to resource → completes assignment.

---

### Layer 3: Smart Scheduling (Future)
**What it does:** AI estimates time needed, suggests: "Block 2-4pm for Data 101 HW based on past patterns."

**Why it matters:** Moves from reporting to recommending. True secretary behavior.

**Parking this:** Technically complex, requires usage data. Only build after Layer 1-2 validated.

---

## Go-to-Market

| Phase | Action | Goal |
|-------|--------|------|
| **Week 1** | Ship Chrome extension, share in Berkeley student Discords/Reddit | 50 installs |
| **Week 2** | Add morning digest, collect emails | 200 users, 50 digest subscribers |
| **Week 3** | Expand to 2-3 other UC schools | Validate cross-institution demand |
| **Month 2** | Product Hunt launch | 1,000 users |

---

## Competitive Moat

| Competitor | What they do | Our edge |
|------------|--------------|----------|
| Notion Canvas Import | Syncs to Notion database | We sync to **calendars** (where students actually live) |
| Canvas native calendar | Shows assignments | No Google Calendar sync, no notifications, no resources |
| Manual tracking | Spreadsheets, planners | We're automatic |

**Layer 2 is the real moat.** Anyone can build calendar sync. Nobody delivers a morning briefing with contextual resources.

---

## Key Risks

1. **Google Calendar OAuth approval** — May need verification for 100+ users. Mitigation: Start with "testing" mode, apply early.

2. **Canvas API changes** — We rely on unauthenticated session-cookie API access. Mitigation: This pattern has worked for 3+ years (Notion Canvas Import proves it).

3. **Layer 2 requires backend** — Adds complexity and cost. Mitigation: Use serverless (Supabase/Vercel), stay under free tier until validated.

---

## Non-Goals (For Now)

- ❌ Custom professor website scraping (complex, save for later)
- ❌ Apple Calendar native sync (no API, would need .ics workaround)
- ❌ Mobile app (extension-first, mobile can wait)
- ❌ Multi-LMS support (Canvas only until PMF)
- ❌ AI scheduling recommendations (Layer 3, post-validation)

---

## Definition of Done: Week 1 MVP

- [ ] User installs extension from Chrome Web Store (or unpacked)
- [ ] User authenticates Google Calendar (one click)
- [ ] User navigates to any Canvas course
- [ ] User clicks "Sync" → all assignments appear in Google Calendar
- [ ] Events show: `[COURSE_CODE] Assignment Name` with due date and Canvas link
- [ ] Re-syncing updates existing events (no duplicates)

**That's it. Ship this, get users, then build Layer 2.**
