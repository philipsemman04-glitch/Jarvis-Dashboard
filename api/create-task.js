const { createPage } = require("./_notion");

/**
 * POST /api/create-task
 * Body: { taskName, project, priority, targetDate? }
 *
 * Creates a new row directly in Master Actions — the single source of
 * truth for tasks across every project, so nothing created here becomes
 * a duplicate/parallel list.
 */
const DB_ACTIONS = process.env.NOTION_DB_ACTIONS || "de671725-0aef-44f7-9ec4-a577b1c7e254";

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Use POST" });
    return;
  }
  try {
    const { taskName, project, priority, targetDate } = req.body || {};
    if (!taskName || !taskName.trim()) {
      res.status(400).json({ error: "taskName is required" });
      return;
    }

    const properties = {
      "Task Name": { title: [{ text: { content: taskName.trim() } }] },
      Status: { select: { name: "No iniciado" } },
      Priority: { select: { name: priority || "P2" } },
    };
    if (project && project !== "Sin proyecto") {
      properties["Project"] = { select: { name: project } };
    }
    if (targetDate) {
      properties["Target Date"] = { date: { start: targetDate } };
    }

    const page = await createPage(DB_ACTIONS, properties);
    res.status(200).json({ ok: true, pageId: page.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
