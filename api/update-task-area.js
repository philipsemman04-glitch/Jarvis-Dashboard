// POST /api/update-task-area
// Body: { pageId, area }
// Moves a task to a different area (Related Entity) — used by the ONG
// kanban board's drag-and-drop between columns. Looks the area up by
// name within Master Entities (case-insensitive), same pattern as the
// area lookup in create-task.js.

const { updatePage, queryDatabase, getTitle } = require("./_notion");
const DB_ENTITIES = process.env.NOTION_DB_ENTITIES || "f964fea0-c3d9-478b-8790-7eaa70a19b00";

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Use POST" });
    return;
  }
  try {
    const { pageId, area } = req.body || {};
    if (!pageId || !area) {
      res.status(400).json({ error: "pageId and area are required" });
      return;
    }
    const entityPages = await queryDatabase(DB_ENTITIES, {});
    const target = area.trim().toLowerCase();
    const match = entityPages.find((p) => getTitle(p.properties, "Entity Name").toLowerCase() === target);
    if (!match) {
      res.status(404).json({ error: `No area named "${area}" found.` });
      return;
    }
    const result = await updatePage(pageId, { "Related Entity": { relation: [{ id: match.id }] } });
    res.status(200).json({ ok: true, pageId: result.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
