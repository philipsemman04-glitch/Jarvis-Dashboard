// GET /api/personal-os-data
// Rebuilt for the simplified Personal OS spec (Aug 15): one flat habit
// list (no categories), a real per-habit completion log for the
// consistency calendar, simple personal tasks (Critical/High/Medium/Low +
// Pending/In Progress/Completed), and a completed-tasks record.
//
// Every number here is computed from real rows — no invented percentages,
// no categories beyond what the person actually created.

const NOTION_VERSION = "2025-09-03";
const NOTION_TOKEN = process.env.NOTION_TOKEN;

const DB_HABITS = process.env.NOTION_DB_HABITS_TRACKER || "d6385a58-5315-47a7-a79d-af1002c479e3";
const DB_HABIT_LOG = process.env.NOTION_DB_HABIT_LOG || "d6ab476f-5034-4f79-b8a4-b9b202f9df1d";
const DB_ACTIONS = process.env.NOTION_DB_ACTIONS || "de671725-0aef-44f7-9ec4-a577b1c7e254";

async function notionQuery(dataSourceId, body = {}) {
  const res = await fetch(`https://api.notion.com/v1/data_sources/${dataSourceId}/query`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${NOTION_TOKEN}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Notion query failed (${res.status}) for ${dataSourceId}: ${await res.text()}`);
  return res.json();
}

function text(prop) {
  if (!prop) return "";
  if (prop.type === "title") return (prop.title || []).map(t => t.plain_text).join("");
  if (prop.type === "rich_text") return (prop.rich_text || []).map(t => t.plain_text).join("");
  return "";
}
function select(prop) { return prop?.select?.name || null; }
function checkbox(prop) { return !!prop?.checkbox; }
function number(prop) { return typeof prop?.number === "number" ? prop.number : null; }
function relationIds(prop) { return (prop?.relation || []).map(r => r.id); }

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  if (!NOTION_TOKEN) {
    res.status(200).json({ error: "NOTION_TOKEN not set", habits: [], pendingTasks: [], completedTasks: [] });
    return;
  }
  try {
    const [habitsRes, logRes, tasksRes] = await Promise.all([
      notionQuery(DB_HABITS, { filter: { property: "Status", select: { equals: "Active" } } }),
      notionQuery(DB_HABIT_LOG, {}),
      notionQuery(DB_ACTIONS, { filter: { property: "Project", select: { equals: "Personal" } } }),
    ]);

    const habits = (habitsRes.results || []).map(p => ({
      id: p.id,
      name: text(p.properties["Habit"]),
      doneToday: checkbox(p.properties["Done Today?"]),
      streak: number(p.properties["Current Streak"]) ?? 0,
    }));

    // Real completion log per habit — powers the consistency calendar.
    const logByHabit = {};
    (logRes.results || []).forEach(p => {
      const habitIds = relationIds(p.properties["Habit"]);
      const date = p.properties["Date"]?.date?.start;
      if (!date) return;
      habitIds.forEach(hid => {
        (logByHabit[hid] = logByHabit[hid] || []).push(date);
      });
    });
    habits.forEach(h => { h.completedDates = logByHabit[h.id] || []; });

    const allTasks = (tasksRes.results || []).map(p => ({
      id: p.id,
      notionUrl: p.url,
      name: text(p.properties["Task Name"]),
      priorityLevel: select(p.properties["Priority Level"]),
      status: select(p.properties["Status"]),
      targetDate: p.properties["Target Date"]?.date?.start || null,
      completionDate: p.properties["Completion Date"]?.date?.start || null,
    }));

    const pendingTasks = allTasks.filter(t => t.status !== "Terminado" && t.status !== "Cancelado");
    const completedTasks = allTasks
      .filter(t => t.status === "Terminado")
      .sort((a, b) => (b.completionDate || "").localeCompare(a.completionDate || ""));

    res.status(200).json({
      source: "notion-live",
      fetchedAt: new Date().toISOString(),
      habits,
      pendingTasks,
      completedTasks,
      stats: {
        habitsDoneToday: habits.filter(h => h.doneToday).length,
        habitsTotal: habits.length,
        pendingCount: pendingTasks.length,
        completedCount: completedTasks.length,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(200).json({ error: err.message, habits: [], pendingTasks: [], completedTasks: [] });
  }
};
