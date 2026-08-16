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
 * GET /api/ong-data
 *
 * REBUILT (Aug 15, round 3) to match Aurelio's simplified ONG mockup:
 * a kanban board grouped by real Area (Programación/Desarrollo, Avatar/
 * Pennyworth, Content, Funnels/CRM, LinkedIn, Chatbots, Legal,
 * Integraciones, Business Plan — all 9 are real Master Entities rows),
 * with real stat cards (Critical/Medium/Low, overall progress %,
 * completed count).
 *
 * Note on the 3-tier Crítica/Media/Baja stats: the new "Priority Level"
 * field (Critical/High/Medium/Low) exists but is empty on all 223 real
 * tasks — populating it requires an actual judgment call per task, which
 * isn't something to bulk-guess. So these stat cards are computed from
 * the EXISTING real P0-P3 field instead (P0→Crítica, P1+P2→Media,
 * P3→Baja) — a deterministic, disclosed mapping of data that's already
 * real, not an invented number. Priority Level remains available and
 * editable per-task via the Task Detail view for anyone who wants the
 * finer 4-tier system going forward.
 */
const DB_ACTIONS = process.env.NOTION_DB_ACTIONS || "de671725-0aef-44f7-9ec4-a577b1c7e254";
const DB_ENTITIES = process.env.NOTION_DB_ENTITIES || "f964fea0-c3d9-478b-8790-7eaa70a19b00";

const CLOSED_STATUSES = ["Terminado", "Cancelado"];
const AREA_ORDER = [
  "Programación / Desarrollo", "Avatar IA / Pennyworth", "Contenido",
  "Funnels, CRM y Automatización", "LinkedIn y Captación de Proveedores",
  "Chatbots", "Legal, Corporativo, Fiscal y Cumplimiento",
  "Integraciones, Data & Automatización", "Inversión y Business Plan — Javier",
];

module.exports = async (req, res) => {
  try {
    const [actionPages, entityPages] = await Promise.all([
      queryDatabase(DB_ACTIONS, {
        filter: { property: "Project", select: { equals: "One Night Guest" } },
        sorts: [{ property: "Priority", direction: "ascending" }],
      }),
      queryDatabase(DB_ENTITIES, { filter: { property: "Empresa", select: { equals: "One Night Guest" } } }),
    ]);

    const entityNameById = {};
    entityPages.forEach((p) => { entityNameById[p.id] = getTitle(p.properties, "Entity Name"); });

    const actions = actionPages.map((p) => {
      const props = p.properties;
      const entityIds = getRelationIds(props, "Related Entity");
      return {
        id: p.id,
        notionUrl: p.url,
        taskName: getTitle(props, "Task Name"),
        status: getSelect(props, "Status"),
        priority: getSelect(props, "Priority"),
        priorityLevel: getSelect(props, "Priority Level"),
        collaborators: getRichText(props, "Collaborators"),
        blocksLaunch: getCheckbox(props, "Blocks Launch"),
        targetDate: getDate(props, "Target Date"),
        completionDate: getDate(props, "Completion Date"),
        area: entityIds.length ? (entityNameById[entityIds[0]] || "Sin área") : "Sin área",
      };
    });

    const openTasks = actions.filter((a) => !CLOSED_STATUSES.includes(a.status));
    const completedTasks = actions.filter((a) => a.status === "Terminado");

    const critical = openTasks.filter((a) => a.priority === "P0").length;
    const medium = openTasks.filter((a) => a.priority === "P1" || a.priority === "P2").length;
    const low = openTasks.filter((a) => a.priority === "P3").length;
    const progressPct = actions.length ? Math.round((completedTasks.length / actions.length) * 100) : 0;

    // Kanban columns, in a stable, sensible order — real areas only,
    // including any area with zero current tasks so the column still
    // shows (empty, honest) rather than disappearing.
    const areaNames = [...new Set([...AREA_ORDER, ...entityPages.map((p) => getTitle(p.properties, "Entity Name"))])]
      .filter((name) => entityPages.some((p) => getTitle(p.properties, "Entity Name") === name));
    const board = areaNames.map((area) => ({
      area,
      tasks: openTasks.filter((a) => a.area === area),
    }));

    const criticalList = openTasks
      .filter((a) => a.priority === "P0")
      .sort((a, b) => (a.targetDate || "9999").localeCompare(b.targetDate || "9999"))
      .slice(0, 8);

    res.status(200).json({
      source: "notion-live",
      fetchedAt: new Date().toISOString(),
      project: { name: "One Night Guest", shortName: "ONG" },
      stats: { critical, medium, low, progressPct, completedCount: completedTasks.length, totalCount: actions.length },
      board,
      criticalList,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
