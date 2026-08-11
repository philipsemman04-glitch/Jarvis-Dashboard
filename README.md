# Jarvis Dashboard

Two dashboards (ONG Command Center + Mis Gustos & Aprendizajes) backed by
live data from Notion, deployed on Vercel.

## How it's structured

```
/public                  → the actual dashboard pages (static HTML/CSS/JS)
    index.html            → landing page linking to both dashboards
    ong-command-center.html
    mis-gustos-aprendizajes.html
/api                     → serverless functions (run server-side on Vercel)
    _notion.js             → shared helper functions for calling the Notion API
    ong-data.js             → GET  — returns live ONG dashboard data
    gustos-data.js          → GET  — returns live personal-knowledge data
    update-action.js        → POST — marks a Master Actions row in progress ("Do Now" button)
    capture.js               → POST — creates a new row from a Quick Capture form
vercel.json               → deployment config
package.json               → project manifest (no external dependencies — uses native fetch)
```

Notion stays the single source of truth the whole time. The `/public`
pages never talk to Notion directly — they call the `/api` endpoints,
which run on Vercel's servers and hold the secret token. The token is
never sent to the browser.

## One-time setup

### 1. Environment variables (Vercel → Settings → Environment Variables)

All database IDs below are **confirmed against the real workspace schema**
as of Aug 11 — verified by actually reading each database's properties,
not guessed. Only `NOTION_TOKEN` needs to be set for things to work; every
other variable already has the correct real ID as its default and only
needs overriding if Aurelio's workspace structure changes.

| Variable | Required? | What it is |
|---|---|---|
| `NOTION_TOKEN` | **Yes** | The secret token from your Notion integration (Settings → Connections → Developer portal → your integration → Access token) |
| `NOTION_DB_ACTIONS` | No (has a default) | Master Actions database ID |
| `NOTION_DB_DECISIONS` | No (has a default) | Decision Log database ID |
| `NOTION_DB_BUDGET` | No (has a default) | Budgets/Costs/KPIs database ID |
| `NOTION_DB_CRM_LEADS` | No (has a default) | CRM/Leads database ID |
| `NOTION_PROJECT_ONG_ID` | No (has a default) | The "One Night Guest" row's page ID in the Projects database |
| `NOTION_DB_LEARNING` | No (has a default) | Learning Library database ID |
| `NOTION_DB_HABITS` | No (has a default) | Points to **"Rutina — Registro Diario"**, not the plainer "Habits" database — see note below |
| `NOTION_DB_GOALS` | No (has a default) | Personal Goals database ID |

**Finding a database ID yourself, if you ever need to:** open the database
as a full page in Notion, look at the URL — it's the 32-character string
right after your workspace name and before any `?v=`:
`notion.so/myworkspace/1a2b3c4d5e6f...` ← that part.

**A note on "Habits":** Aurelio's own workspace spec is explicit that the
real habit log is **"Rutina — Registro Diario"** — one row per activity per
day, with per-activity structured fields (Actividad, Fecha, Duración,
Nota rápida, Hecho) — not a generic streak-counter database. The API reads
from that one and computes a simple day-over-day streak from it.

### 2. Share the databases with the integration

In Notion, open each database (or the parent page, which cascades to
everything nested under it) → `•••` menu → Connections → add your
integration. Already done for the top-level "Jarvis" page as of this
build, which should cover everything nested inside it automatically.

### 3. Deploy

Push to GitHub → Vercel auto-deploys. No build step required (it's
static HTML + serverless functions, nothing to compile).

## What's live vs. what's still demo data

- **ONG Command Center**: stats (Critical/On Track/Decisions), Next
  Action, and Blockers/Decisions pull from live Notion data as soon as
  `NOTION_TOKEN` is set — no other configuration needed. MRR pulls from
  a Budget/KPIs row whose title contains "MRR"; if no such row exists
  yet, it's simply omitted rather than showing a wrong number. Today's
  Schedule and the weekly progress chart are still demo data — no
  Notion equivalent was wired up for those yet.

- **Mis Gustos & Aprendizajes**: content counts, library breakdown by
  type, and the topic word cloud are all live as soon as `NOTION_TOKEN`
  is set (reading from Learning Library). The learning streak reads
  from "Rutina — Registro Diario". The knowledge-map network graph is
  still demo data — there's no Notion equivalent for it yet.

- **Write-back**: the "Do Now" button and the Quick Capture forms
  genuinely write to Notion (not just update the browser). Quick
  Capture writes into Learning Library with the closest matching
  `Type` — there's no "Idea" option in that database's real schema, so
  idea/note both save as "Note" rather than silently inventing a new
  option. If a write fails (e.g. a database isn't shared with the
  integration), it fails quietly with a console warning rather than
  breaking the UI — check the browser console if something doesn't
  seem to be saving.

## Extending this

Both dashboard files load their data through one `loadData()` function
near the bottom of the `<script>` tag, which merges live API data over
a `MOCK_DATA` / `DATA` object. To add a new live field: return it from
the relevant `/api/*.js` file, then reference it in that merge step.
