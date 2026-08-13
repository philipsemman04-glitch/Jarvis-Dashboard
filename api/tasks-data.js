const {
  queryDatabase,
  getTitle,
  getRichText,
  getSelect,
  getCheckbox,
  getDate,
} = require("./_notion");

/**
 * GET /api/tasks-data
 *
 * Returns EVERY row in Master Actions (not a truncated top-N), so the
 * global Tareas & Proyectos view can show and filter the real, complete
 * list rather than making it look like there are only a handful of tasks.
 * Filtering by project/status/priority/due happens client-side against
 * this full set.
 */
const DB_ACTIONS = process.env.NOTION_DB_ACTIONS || "de671725-0aef-44f7-9ec4-a577b1c7e254";

module.exports = async (req, res) => {
  try {
    const pages = await queryDatabase(DB_ACTIONS, {
      sorts: [{ property: "Priority", direction: "ascending" }],
    });

    const today = new Date().toISOString().slice(0, 10);

    const tasks = pages.map((p) => {
      const props = p.properties;
      const targetDate = getDate(props, "Target Date");
      const status = getSelect(props, "Status");
      const isOpen = status !== "Terminado" && status !== "Cancelado";
      return {
        id: p.id,
        notionUrl: p.url,
        taskName: getTitle(props, "Task Name"),
        project: getSelect(props, "Project") || "Sin proyecto",
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
    tasks.forEach((t) => {
      byProject[t.project] = (byProject[t.project] || 0) + 1;
      byStatus[t.status] = (byStatus[t.status] || 0) + 1;
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
        byProject,
        byStatus,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
