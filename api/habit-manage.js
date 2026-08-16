// POST /api/habit-manage
// Body: { action: "create", name: string } or { action: "delete", pageId: string }
//
// Lets the person add or remove habits freely from Personal OS itself,
// per Aurelio's explicit request — no categories, just a name. Delete
// archives rather than hard-deletes, so nothing is destroyed irreversibly
// from a UI click.

const NOTION_VERSION = "2025-09-03";
const NOTION_TOKEN = process.env.NOTION_TOKEN;
const DB_HABITS = process.env.NOTION_DB_HABITS_TRACKER || "d6385a58-5315-47a7-a79d-af1002c479e3";

function headers() {
  return { Authorization: `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" };
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
    const { action, name, pageId } = req.body || {};

    if (action === "create") {
      if (!name || !name.trim()) {
        res.status(400).json({ ok: false, error: "name is required" });
        return;
      }
      const createRes = await fetch("https://api.notion.com/v1/pages", {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({
          parent: { type: "data_source_id", data_source_id: DB_HABITS },
          properties: {
            Habit: { title: [{ text: { content: name.trim() } }] },
            Status: { select: { name: "Active" } },
            Frequency: { select: { name: "Daily" } },
          },
        }),
      });
      if (!createRes.ok) throw new Error(`Notion create failed (${createRes.status}): ${await createRes.text()}`);
      const page = await createRes.json();
      res.status(200).json({ ok: true, pageId: page.id });
      return;
    }

    if (action === "delete") {
      if (!pageId) {
        res.status(400).json({ ok: false, error: "pageId is required" });
        return;
      }
      const delRes = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
        method: "PATCH",
        headers: headers(),
        body: JSON.stringify({ properties: { Status: { select: { name: "Stopped" } } } }),
      });
      if (!delRes.ok) throw new Error(`Notion update failed (${delRes.status}): ${await delRes.text()}`);
      res.status(200).json({ ok: true });
      return;
    }

    res.status(400).json({ ok: false, error: "action must be 'create' or 'delete'" });
  } catch (err) {
    console.error(err);
    res.status(200).json({ ok: false, error: err.message });
  }
};
