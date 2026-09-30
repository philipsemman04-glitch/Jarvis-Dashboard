// POST /api/habit-api — consolidated habit endpoint (merges the old
// habit-toggle.js and habit-manage.js into one file, same reason as
// task-api.js: staying under Vercel's 12-function Hobby-plan limit).
//
// Body: { action: "toggle", pageId, done } — mark done/undone, keeps
//   Habit Log in sync (creates/archives today's log entry).
// Body: { action: "create", name, category?, frequency?, goal?, imageDataBase64? } — add a habit.
// Body: { action: "update", pageId, …same fields…, removeImage? } — edit a habit.
// Body: { action: "archive" | "restore", pageId } — hide / bring back (Status).
// Body: { action: "delete", pageId } — move the habit to Notion's trash.

const NOTION_VERSION = "2025-09-03";
const NOTION_TOKEN = process.env.NOTION_TOKEN;
const DB_HABITS = process.env.NOTION_DB_HABITS_TRACKER || "d6385a58-5315-47a7-a79d-af1002c479e3";
const DB_HABIT_LOG = process.env.NOTION_DB_HABIT_LOG || "d6ab476f-5034-4f79-b8a4-b9b202f9df1d";

const { todayISO, richText, ensureProperties, uploadFile } = require("./_notion"); // todayISO: Aurelio's local date, not UTC
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

// Habit fields shown in Personal OS. The category is the Habits database's
// own "Area" select; Goal and Image are added the first time they are needed
// (never removed).
const HABIT_FIELDS = { Frequency: { select: {} }, Area: { select: {} }, Goal: { rich_text: {} }, Image: { files: {} } };

async function habitProperties(b) {
  const props = {};
  if (b.name !== undefined) {
    if (!String(b.name).trim()) throw Object.assign(new Error("El nombre del hábito es obligatorio."), { status: 400 });
    props.Habit = { title: [{ text: { content: String(b.name).trim() } }] };
  }
  if (b.frequency !== undefined) props.Frequency = b.frequency ? { select: { name: b.frequency } } : { select: null };
  if (b.category !== undefined) props.Area = b.category ? { select: { name: String(b.category).trim() } } : { select: null };
  if (b.goal !== undefined) props.Goal = richText(b.goal || "");
  if (b.imageDataBase64) props.Image = { files: await uploadFile(b.imageFilename || "habito.jpg", b.imageContentType || "image/jpeg", b.imageDataBase64) };
  else if (b.removeImage) props.Image = { files: [] };
  return props;
}

async function handleCreate(req, res) {
  const b = req.body || {};
  if (!b.name || !String(b.name).trim()) { res.status(400).json({ ok: false, error: "name is required" }); return; }
  await ensureProperties(DB_HABITS, HABIT_FIELDS);
  const properties = { ...(await habitProperties({ frequency: "Daily", ...b })), Status: { select: { name: "Active" } } };
  const createRes = await fetch("https://api.notion.com/v1/pages", {
    method: "POST", headers: headers(),
    body: JSON.stringify({ parent: { type: "data_source_id", data_source_id: DB_HABITS }, properties }),
  });
  if (!createRes.ok) throw new Error(`Notion create failed (${createRes.status}): ${await createRes.text()}`);
  const page = await createRes.json();
  res.status(200).json({ ok: true, pageId: page.id });
}

async function handleUpdate(req, res) {
  const b = req.body || {};
  if (!b.pageId) { res.status(400).json({ ok: false, error: "pageId is required" }); return; }
  await ensureProperties(DB_HABITS, HABIT_FIELDS);
  const properties = await habitProperties(b);
  const r = await fetch(`https://api.notion.com/v1/pages/${b.pageId}`, { method: "PATCH", headers: headers(), body: JSON.stringify({ properties }) });
  if (!r.ok) throw new Error(`Notion update failed (${r.status}): ${await r.text()}`);
  res.status(200).json({ ok: true });
}

// "archive" keeps the habit and its history in Notion but hides it
// (Status = Stopped); "restore" brings it back; "delete" moves the page to
// Notion's trash.
async function setStatus(pageId, name) {
  const r = await fetch(`https://api.notion.com/v1/pages/${pageId}`, { method: "PATCH", headers: headers(), body: JSON.stringify({ properties: { Status: { select: { name } } } }) });
  if (!r.ok) throw new Error(`Notion update failed (${r.status}): ${await r.text()}`);
}
async function handleArchive(req, res) {
  const { pageId } = req.body || {};
  if (!pageId) { res.status(400).json({ ok: false, error: "pageId is required" }); return; }
  await setStatus(pageId, "Stopped");
  res.status(200).json({ ok: true });
}
async function handleRestore(req, res) {
  const { pageId } = req.body || {};
  if (!pageId) { res.status(400).json({ ok: false, error: "pageId is required" }); return; }
  await setStatus(pageId, "Active");
  res.status(200).json({ ok: true });
}
async function handleDelete(req, res) {
  const { pageId } = req.body || {};
  if (!pageId) { res.status(400).json({ ok: false, error: "pageId is required" }); return; }
  const r = await fetch(`https://api.notion.com/v1/pages/${pageId}`, { method: "PATCH", headers: headers(), body: JSON.stringify({ in_trash: true }) });
  if (!r.ok) throw new Error(`Notion delete failed (${r.status}): ${await r.text()}`);
  res.status(200).json({ ok: true });
}

module.exports = async (req, res) => {
  if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return; }
  if (!NOTION_TOKEN) { res.status(500).json({ ok: false, error: "NOTION_TOKEN not set" }); return; }
  try {
    const action = req.body?.action;
    if (action === "toggle") return await handleToggle(req, res);
    if (action === "create") return await handleCreate(req, res);
    if (action === "update") return await handleUpdate(req, res);
    if (action === "archive") return await handleArchive(req, res);
    if (action === "restore") return await handleRestore(req, res);
    if (action === "delete") return await handleDelete(req, res);
    res.status(400).json({ ok: false, error: "Unknown action" });
  } catch (err) {
    console.error(err);
    res.status(err.status || 500).json({ ok: false, error: err.message });
  }
};
