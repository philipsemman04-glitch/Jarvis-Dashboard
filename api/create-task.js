const { createPage, queryDatabase, getTitle } = require("./_notion");

/**
 * POST /api/create-task
 * Body: { taskName, project, priority?, priorityLevel?, targetDate?, area?, description? }
 *
 * Creates a new row in Master Actions.
 *
 * FIX (Aug 15, round 3): added priorityLevel (Critical/High/Medium/Low) —
 * a SEPARATE field from the existing "priority" (P0-P3), per Aurelio's
 * explicit instruction not to replace or remap the existing P-level
 * system. A task can have either, both, or neither. Also added
 * "description" for the new free-text Description field used by the
 * task detail view.
 */
const DB_ACTIONS = process.env.NOTION_DB_ACTIONS || "de671725-0aef-44f7-9ec4-a577b1c7e254";
const DB_ENTITIES = process.env.NOTION_DB_ENTITIES || "f964fea0-c3d9-478b-8790-7eaa70a19b00";

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Use POST" });
    return;
  }
  try {
    const { taskName, project, priority, priorityLevel, targetDate, area, description } = req.body || {};
    if (!taskName || !taskName.trim()) {
      res.status(400).json({ error: "taskName is required" });
      return;
    }

    const properties = {
      "Task Name": { title: [{ text: { content: taskName.trim() } }] },
      Status: { select: { name: "No iniciado" } },
    };
    if (priority) properties["Priority"] = { select: { name: priority } };
    if (priorityLevel) properties["Priority Level"] = { select: { name: priorityLevel } };
    if (project && project !== "Sin proyecto") {
      properties["Project"] = { select: { name: project } };
    }
    if (targetDate) {
      properties["Target Date"] = { date: { start: targetDate } };
    }
    if (description) {
      properties["Description"] = { rich_text: [{ text: { content: description } }] };
    }

    let areaMatched = null;
    let areaWarning = null;
    if (area && area.trim()) {
      if (!project) {
        areaWarning = `Area "${area}" was given but no project was specified, so it can't be scoped — area not set.`;
      } else {
        const entityPages = await queryDatabase(DB_ENTITIES, {
          filter: { property: "Empresa", select: { equals: project } },
        });
        const target = area.trim().toLowerCase();
        const match = entityPages.find((p) => getTitle(p.properties, "Entity Name").toLowerCase() === target);
        if (match) {
          areaMatched = getTitle(match.properties, "Entity Name");
          properties["Related Entity"] = { relation: [{ id: match.id }] };
        } else {
          const realNames = entityPages.map((p) => getTitle(p.properties, "Entity Name"));
          areaWarning = `No area named "${area}" found under ${project} — task created without an area link. Real areas for ${project}: ${realNames.join(", ")}.`;
        }
      }
    }

    const page = await createPage(DB_ACTIONS, properties);
    res.status(200).json({ ok: true, pageId: page.id, areaMatched, areaWarning });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
