const { createPage, queryDatabase, getTitle } = require("./_notion");

/**
 * POST /api/create-task
 * Body: { taskName, project, priority, targetDate?, area? }
 *
 * Creates a new row directly in Master Actions — the single source of
 * truth for tasks across every project, so nothing created here becomes
 * a duplicate/parallel list.
 *
 * "area" is a plain area name (e.g. "Product & Design"), not a Notion
 * page ID — this is what makes Aurelio's literal example work end-to-end:
 * "Add this task to RoutePup under Product & Design." The area is looked
 * up in Master Entities, scoped to the given project so a name that
 * happens to repeat across projects still resolves to the right one. If
 * "area" doesn't match any real area for that project, the task is still
 * created (project-level), and the response says so honestly rather than
 * silently failing or guessing.
 */
const DB_ACTIONS = process.env.NOTION_DB_ACTIONS || "de671725-0aef-44f7-9ec4-a577b1c7e254";
const DB_ENTITIES = process.env.NOTION_DB_ENTITIES || "f964fea0-c3d9-478b-8790-7eaa70a19b00";

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Use POST" });
    return;
  }
  try {
    const { taskName, project, priority, targetDate, area } = req.body || {};
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

    let areaMatched = null;
    let areaWarning = null;
    if (area && area.trim()) {
      if (!project) {
        areaWarning = `Area "${area}" was given but no project was specified, so it can't be scoped — area not set.`;
      } else {
        const entityPages = await queryDatabase(DB_ENTITIES, {
          filter: { property: "Empresa", select: { equals: project } },
        });
        // Case-insensitive match — real area names are in Spanish (e.g.
        // "Producto y Diseño"), so a literal English guess like "Product &
        // Design" needs a clear path to the right answer, not a silent
        // failure. Listing real options below covers the language gap.
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
