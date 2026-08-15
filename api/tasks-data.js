const {
  queryDatabase,
  getTitle,
  getRichText,
  getSelect,
  getCheckbox,
  getDate,
  getRelationIds,
} = require("./_notion");

/**
 * GET /api/tasks-data
 *
 * Returns EVERY row in Master Actions (not a truncated top-N), so the
 * global Tareas & Proyectos view can show and filter the real, complete
 * list rather than making it look like there are only a handful of tasks.
 * Filtering by project/status/priority/due/area happens client-side
 * against this full set.
 *
 * FIX (Aug 15, round 2): added area resolution via "Related Entity" — a
 * relation to Master Entities that already existed and was already
 * populated on 219 of 223 real tasks, but was never read or surfaced by
 * any dashboard, including this one. Every task now carries its real
 * area name, and the summary includes a real byArea breakdown.
 */
const DB_ACTIONS = process.env.NOTION_DB_ACTIONS || "de671725-0aef-44f7-9ec4-a577b1c7e254";
const DB_ENTITIES = process.env.NOTION_DB_ENTITIES || "f964fea0-c3d9-478b-8790-7eaa70a19b00";

module.exports = async (req, res) => {
  try {
    const [pages, entityPages] = await Promise.all([
      queryDatabase(DB_ACTIONS, {
        sorts: [{ property: "Priority", direction: "ascending" }],
      }),
      queryDatabase(DB_ENTITIES, {}),
    ]);

    const entityNameById = {};
    entityPages.forEach((p) => { entityNameById[p.id] = getTitle(p.properties, "Entity Name"); });

    const today = new Date().toISOString().slice(0, 10);

    const tasks = pages.map((p) => {
      const props = p.properties;
      const targetDate = getDate(props, "Target Date");
      const status = getSelect(props, "Status");
      const isOpen = status !== "Terminado" && status !== "Cancelado";
      const entityIds = getRelationIds(props, "Related Entity");
      return {
        id: p.id,
        notionUrl: p.url,
        taskName: getTitle(props, "Task Name"),
        project: getSelect(props, "Project") || "Sin proyecto",
        area: entityIds.length ? (entityNameById[entityIds[0]] || null) : null,
        status: status || "No iniciado",
        priority: getSelect(props, "Priority") || "P3",
        urgency: getSelect(props, "Urgency"),
        impact: getSelect(props, "Impact"),
        type: getSelect(props, "Type"),
        blocksLaunch: getCheckbox(props, "Blocks Launch"),
        targetDate,
        nextAction: getRichText(props, "Next Action"),
        completionCriteria: getRichText(props, "Completion Criteria"),
        isOverdue: !!(isOpen && targetDate && targetDate < today),
        isDueToday: !!(isOpen && targetDate === today),
      };
    });

    const byProject = {};
    const byStatus = {};
    const byArea = {};
    tasks.forEach((t) => {
      byProject[t.project] = (byProject[t.project] || 0) + 1;
      byStatus[t.status] = (byStatus[t.status] || 0) + 1;
      if (t.area) byArea[t.area] = (byArea[t.area] || 0) + 1;
    });

    res.status(200).json({
      source: "notion-live",
      fetchedAt: new Date().toISOString(),
      tasks,
      summary: {
        total: tasks.length,
        overdue: tasks.filter((t) => t.isOverdue).length,
        dueToday: tasks.filter((t) => t.isDueToday).length,
        blocked: tasks.filter((t) => t.status === "Bloqueado").length,
        withArea: tasks.filter((t) => t.area).length,
        byProject,
        byStatus,
        byArea,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
