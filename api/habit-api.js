// POST /api/habit-api — consolidated habit endpoint (merges the old
// habit-toggle.js and habit-manage.js into one file, same reason as
// task-api.js: staying under Vercel's 12-function Hobby-plan limit).
//
// Body: { action: "toggle", pageId, done } — mark done/undone, keeps
//   Habit Log in sync (creates/archives today's log entry).
// Body: { action: "create", name } — add a new habit.
// Body: { action: "delete", pageId } — archive a habit (sets Stopped).

const NOTION_VERSION = "2025-09-03";
const NOTION_TOKEN = process.env.NOTION_TOKEN;
const DB_HABITS = process.env.NOTION_DB_HABITS_TRACKER || "d6385a58-5315-47a7-a79d-af1002c479e3";
const DB_HABIT_LOG = process.env.NOTION_DB_HABIT_LOG || "d6ab476f-5034-4f79-b8a4-b9b202f9df1d";

function todayISO() { return new Date().toISOString().slice(0, 10); }
function headers() { return { Authorization: `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" }; }

async function findTodayLogEntry(habitId, date) {
  const res = await fetch(`https://api.notion.com/v1/data_sources/${DB_HABIT_LOG}/query`, {
    method: "POST", headers: headers(),
    body: JSON.stringify({ filter: { and: [{ property: "Habit", relation: { contains: habitId } }, { property: "Date", date: { equals: date } }] } }),
  });
  if (!res.ok) throw new Error(`Notion query failed (${res.status}): ${await res.text()}`);
  const data = await res.json();
  return data.results?.[0] || null;
}

async function handleToggle(req, res) {
  const { pageId, done } = req.body || {};
  if (!pageId) { res.status(400).json({ ok: false, error: "pageId required" }); return; }
  const today = todayISO();
  const properties = { "Done Today?": { checkbox: !!done } };
  if (done) properties["Last Completed Date"] = { date: { start: today } };
  const patchRes = await fetch(`https://api.notion.com/v1/pages/${pageId}`, { method: "PATCH", headers: headers(), body: JSON.stringify({ properties }) });
  if (!patchRes.ok) throw new Error(`Notion update failed (${patchRes.status}): ${await patchRes.text()}`);

  const existing = await findTodayLogEntry(pageId, today);
  if (done && !existing) {
    const createRes = await fetch("https://api.notion.com/v1/pages", {
      method: "POST", headers: headers(),
      body: JSON.stringify({
        parent: { type: "data_source_id", data_source_id: DB_HABIT_LOG },
        properties: { Entry: { title: [{ text: { content: `${today} completion` } }] }, Habit: { relation: [{ id: pageId }] }, Date: { date: { start: today } } },
      }),
    });
    if (!createRes.ok) throw new Error(`Notion log create failed (${createRes.status}): ${await createRes.text()}`);
  } else if (!done && existing) {
    const delRes = await fetch(`https://api.notion.com/v1/pages/${existing.id}`, { method: "PATCH", headers: headers(), body: JSON.stringify({ archived: true }) });
    if (!delRes.ok) throw new Error(`Notion log archive failed (${delRes.status}): ${await delRes.text()}`);
  }
  res.status(200).json({ ok: true });
}

async function handleCreate(req, res) {
  const { name } = req.body || {};
  if (!name || !name.trim()) { res.status(400).json({ ok: false, error: "name is required" }); return; }
  const createRes = await fetch("https://api.notion.com/v1/pages", {
    method: "POST", headers: headers(),
    body: JSON.stringify({
      parent: { type: "data_source_id", data_source_id: DB_HABITS },
      properties: { Habit: { title: [{ text: { content: name.trim() } }] }, Status: { select: { name: "Active" } }, Frequency: { select: { name: "Daily" } } },
    }),
  });
  if (!createRes.ok) throw new Error(`Notion create failed (${createRes.status}): ${await createRes.text()}`);
  const page = await createRes.json();
  res.status(200).json({ ok: true, pageId: page.id });
}

async function handleDelete(req, res) {
  const { pageId } = req.body || {};
  if (!pageId) { res.status(400).json({ ok: false, error: "pageId is required" }); return; }
  const delRes = await fetch(`https://api.notion.com/v1/pages/${pageId}`, { method: "PATCH", headers: headers(), body: JSON.stringify({ properties: { Status: { select: { name: "Stopped" } } } }) });
  if (!delRes.ok) throw new Error(`Notion update failed (${delRes.status}): ${await delRes.text()}`);
  res.status(200).json({ ok: true });
}

module.exports = async (req, res) => {
  if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return; }
  if (!NOTION_TOKEN) { res.status(200).json({ ok: false, error: "NOTION_TOKEN not set" }); return; }
  try {
    const action = req.body?.action;
    if (action === "toggle") return await handleToggle(req, res);
    if (action === "create") return await handleCreate(req, res);
    if (action === "delete") return await handleDelete(req, res);
    res.status(400).json({ ok: false, error: "action must be 'toggle', 'create', or 'delete'" });
  } catch (err) {
    console.error(err);
    res.status(200).json({ ok: false, error: err.message });
  }
};
