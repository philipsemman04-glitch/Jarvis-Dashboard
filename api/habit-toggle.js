// POST /api/habit-toggle
// Body: { pageId: string, done: boolean }
//
// Toggles a Habit's "Done Today?" checkbox AND writes/removes a real row
// in Habit Log for today — this log is what actually powers the
// consistency calendar (Habits itself only ever tracked "today" plus a
// streak number, never a real per-day history).

const NOTION_VERSION = "2025-09-03";
const NOTION_TOKEN = process.env.NOTION_TOKEN;
const DB_HABIT_LOG = process.env.NOTION_DB_HABIT_LOG || "d6ab476f-5034-4f79-b8a4-b9b202f9df1d";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function headers() {
  return { Authorization: `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" };
}

async function findTodayLogEntry(habitId, date) {
  const res = await fetch(`https://api.notion.com/v1/data_sources/${DB_HABIT_LOG}/query`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      filter: {
        and: [
          { property: "Habit", relation: { contains: habitId } },
          { property: "Date", date: { equals: date } },
        ],
      },
    }),
  });
  if (!res.ok) throw new Error(`Notion query failed (${res.status}): ${await res.text()}`);
  const data = await res.json();
  return data.results?.[0] || null;
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  if (!NOTION_TOKEN) {
    res.status(200).json({ ok: false, error: "NOTION_TOKEN not set" });
    return;
  }
  try {
    const { pageId, done } = req.body || {};
    if (!pageId) {
      res.status(400).json({ ok: false, error: "pageId required" });
      return;
    }
    const today = todayISO();

    const properties = { "Done Today?": { checkbox: !!done } };
    if (done) properties["Last Completed Date"] = { date: { start: today } };

    const patchRes = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
      method: "PATCH",
      headers: headers(),
      body: JSON.stringify({ properties }),
    });
    if (!patchRes.ok) throw new Error(`Notion update failed (${patchRes.status}): ${await patchRes.text()}`);

    // Keep Habit Log in sync: add today's entry when marking done, remove
    // it when un-marking — so the log always reflects reality exactly,
    // never a stale leftover entry.
    const existing = await findTodayLogEntry(pageId, today);
    if (done && !existing) {
      const createRes = await fetch("https://api.notion.com/v1/pages", {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({
          parent: { type: "data_source_id", data_source_id: DB_HABIT_LOG },
          properties: {
            Entry: { title: [{ text: { content: `${today} completion` } }] },
            Habit: { relation: [{ id: pageId }] },
            Date: { date: { start: today } },
          },
        }),
      });
      if (!createRes.ok) throw new Error(`Notion log create failed (${createRes.status}): ${await createRes.text()}`);
    } else if (!done && existing) {
      const delRes = await fetch(`https://api.notion.com/v1/pages/${existing.id}`, {
        method: "PATCH",
        headers: headers(),
        body: JSON.stringify({ archived: true }),
      });
      if (!delRes.ok) throw new Error(`Notion log archive failed (${delRes.status}): ${await delRes.text()}`);
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(200).json({ ok: false, error: err.message });
  }
};
