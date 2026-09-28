# Jarvis Dashboard

Aurelio's personal command center: a set of dashboards backed by live data
from his Notion workspace, deployed on Vercel. Built for a single user —
the whole site sits behind one login.

## How it's structured

```
middleware.js              → login gate for every page and /api route (see "Access control")
/public                    → the dashboard pages (static HTML/CSS/JS, UI in Spanish)
    index.html               → Home: workspace cards
    ong-command-center.html  → One Night Guest board + Penny AI chat
    project-command-center.html → same board for any project (?project=RoutePup, StatStrike, Nikita…)
    tareas-proyectos.html    → every task across all projects, with filters
    personal-os.html         → habits, personal tasks, notes, Spotify link
    mis-gustos-aprendizajes.html → references and topics ("Referencias" database)
    aristoteles.html         → self-knowledge documents, grouped by section
    meetings.html, decision-log.html, general-calendar.html, ong-calendar.html
    sistemas-ajustes.html    → Notion connection health + workspace branding
    new-project.html         → creates a new project with its standard areas
    coming-soon.html         → placeholder for workspaces not built yet
    sidebar.js               → shared sidebar, built from the Workspaces database
    toast.js                 → shared "Guardando… / Guardado / error" messages
/api                       → serverless functions (run on Vercel, hold the Notion token)
    _notion.js               → shared helpers: paginated queries, create/update, richText, todayISO
    task-api.js              → tasks, meetings, decisions, calendar (dispatch on `action`)
    project-data.js          → one project's board, Aristóteles data, area create/rename/archive
    tasks-data.js            → all tasks, for Tareas & Proyectos
    workspaces-data.js       → Home cards + sidebar (GET), branding/logo uploads (POST)
    personal-os-data.js      → habits, habit log, personal tasks
    habit-api.js             → habit toggle / create / stop
    gustos-data.js           → Referencias read (+ single reference detail)
    capture.js               → Referencias writes, topics, Aristóteles docs/sections
    scaffold-project.js      → new project + its areas + Workspaces card
    system-health.js         → pings every database for the Settings page
    penny-ai.js              → Penny AI chat (server-side AI provider key)
/scripts
    check_public_refs.py     → dev check: every local asset referenced by a page exists
vercel.json                → deployment config
package.json               → project manifest (no dependencies — uses native fetch)
```

Notion is the single source of truth. The pages never talk to Notion
directly — they call `/api/*`, which runs on Vercel and holds the token.
The token is never sent to the browser.

## One-time setup

### 1. Environment variables (Vercel → Settings → Environment Variables)

| Variable | Required? | What it is |
|---|---|---|
| `NOTION_TOKEN` | **Yes** | Secret token of the Notion integration |
| `JARVIS_USER` | **Yes** | Login username for the whole site |
| `JARVIS_PASSWORD` | **Yes** | Login password — use a long, random one |
| `JARVIS_TIMEZONE` | No (default `America/Mexico_City`) | Aurelio's time zone, used for "today" (habit log, completion dates, overdue tasks) |
| `BUILT_IN_FORGE_API_URL` / `BUILT_IN_FORGE_API_KEY` (or `OPENAI_API_BASE` / `OPENAI_API_KEY`) | For Penny AI | OpenAI-compatible chat endpoint and key |
| `JARVIS_AI_MODEL` | No | Model name sent to that endpoint |
| `NOTION_DB_*` | No (have defaults) | Override a database ID if the workspace changes — see the top of each `/api` file |

**Access control:** `middleware.js` (Vercel Routing Middleware) runs before
every page and every `/api/*` call and requires the `JARVIS_USER` /
`JARVIS_PASSWORD` login (HTTP Basic Auth — the browser asks once, then
sends it automatically). If either variable is missing, the site refuses
all requests, so set both **before** deploying.

**Finding a database ID:** open the database as a full page in Notion; it's
the 32-character string in the URL before any `?v=`.

### 2. Share the databases with the integration

In Notion, open the top-level "Jarvis" page → `•••` → Connections → add the
integration. Everything nested under it inherits access. The Settings page
(Sistemas & Ajustes) shows which databases the token can reach.

### 3. Deploy

Push to GitHub → Vercel deploys. No build step.

## Conventions

- **Writes report real errors.** API failures return HTTP 4xx/5xx with
  `{ ok: false, error }`, so pages show the failure instead of "Guardado".
- **Escape everything from Notion.** Pages build HTML with template
  strings; any Notion value must go through `esc()`, and any Notion link
  through `safeUrl()` (http/https only).
- **Long text:** write text properties with `richText()` from `_notion.js`
  — it splits content past Notion's 2,000-character block limit.
- **Dates:** use `todayISO()` on the server (Aurelio's time zone) and the
  browser's local date on the client — never `toISOString().slice(0, 10)`.
- **Uploads:** Vercel caps request bodies at ~4.5 MB, so files are limited
  to 3 MB (2 MB for icons/logos) before base64 encoding.
- **Language:** everything Aurelio sees is in Spanish.
