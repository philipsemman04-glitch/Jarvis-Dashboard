const { queryDatabase, getTitle, getRichText, getSelect, getNumber } = require("./_notion");

/**
 * GET /api/workspaces-data
 *
 * Reads the "🗂️ Workspaces" database — the single editable source for the
 * Jarvis Home screen (name, icon, description, route, color, status, order
 * still come from there). Aurelio can add/reorder/re-route workspaces
 * directly in Notion with no code changes.
 *
 * FIX (Aug 15): "Stat Label" used to be read verbatim from a manually-typed
 * Notion field — which is exactly why One Night Guest, the most important
 * workspace, was showing "No data yet" (the field really was just blank,
 * not a broken connection). Per Aurelio's explicit instruction, a
 * hand-typed number that goes stale the moment reality changes is worse
 * than an honest empty state — so every stat below is now computed live
 * from the actual databases each time this endpoint runs. The stored
 * "Stat Label" field is now only a fallback for workspaces with no defined
 * computation rule (e.g. Calendario, Sistemas & Ajustes).
 */
const DB_WORKSPACES = process.env.NOTION_DB_WORKSPACES || "0c06b31c-8503-4cf6-85cb-65884d7e7a26";
const DB_ACTIONS = process.env.NOTION_DB_ACTIONS || "de671725-0aef-44f7-9ec4-a577b1c7e254";
const DB_ROUTEPUP_CARDS = process.env.NOTION_DB_ROUTEPUP_CARDS || "f9fc7996-b03d-4ed2-bb16-fa2d616d8e46";
const DB_ARISTOTELES_DOCS = process.env.NOTION_DB_ARISTOTELES_DOCS || "650f515d-4540-4a67-9066-f04b0944e394";
const DB_REFERENCIAS = process.env.NOTION_DB_REFERENCIAS || "7456b43c-50ef-4e15-bea4-ab2f824add71";

const OPEN_STATUSES = new Set(["No iniciado", "Preparación", "En progreso", "En revisión", "En validación", "Bloqueado"]);

module.exports = async (req, res) => {
  try {
    const [wsPages, actionPages, cardPages, docPages, refPages] = await Promise.all([
      queryDatabase(DB_WORKSPACES, { sorts: [{ property: "Order", direction: "ascending" }] }),
      queryDatabase(DB_ACTIONS, {}),
      queryDatabase(DB_ROUTEPUP_CARDS, {}).catch(() => []),
      queryDatabase(DB_ARISTOTELES_DOCS, {}).catch(() => []),
      queryDatabase(DB_REFERENCIAS, {}).catch(() => []),
    ]);

    // Active (not done/cancelled) task count per project, computed once
    const activeTasksByProject = {};
    actionPages.forEach((p) => {
      const project = getSelect(p.properties, "Project");
      const status = getSelect(p.properties, "Status");
      if (project && OPEN_STATUSES.has(status)) {
        activeTasksByProject[project] = (activeTasksByProject[project] || 0) + 1;
      }
    });
    const totalActiveTasks = Object.values(activeTasksByProject).reduce((a, b) => a + b, 0);

    const routePupCardCount = cardPages.length;
    const aristotelesDocCount = docPages.length;
    const referenciasCount = refPages.length;

    // Computed-stat rules, keyed by exact workspace Name. Anything not
    // listed here falls back to the stored "Stat Label" field.
    function computedStat(name) {
      switch (name) {
        case "One Night Guest": {
          const n = activeTasksByProject["One Night Guest"] || 0;
          return n ? `${n} tareas activas` : null;
        }
        case "RoutePup": {
          const tasks = activeTasksByProject["RoutePup"] || 0;
          return `${routePupCardCount} tarjetas · ${tasks} tareas activas`;
        }
        case "Nikita": {
          const tasks = activeTasksByProject["Nikita"] || 0;
          return tasks ? `${tasks} tareas activas` : "Sin tareas activas aún";
        }
        case "StatStrike": {
          const tasks = activeTasksByProject["StatStrike"] || 0;
          return tasks ? `${tasks} tareas activas` : "Sin tareas activas aún";
        }
        case "Aristóteles":
          return `${aristotelesDocCount} documentos reales`;
        case "Mis Gustos & Conocimiento":
          return referenciasCount ? `${referenciasCount} referencias guardadas` : "Sin referencias aún";
        case "Tareas & Proyectos":
          return `${totalActiveTasks} tareas activas en total`;
        case "Personal OS": {
          const tasks = activeTasksByProject["Personal"] || 0;
          return tasks ? `${tasks} tareas pendientes` : "Sin tareas pendientes";
        }
        default:
          return null; // no computed rule — fall back to stored Stat Label
      }
    }

    const workspaces = wsPages.map((p) => {
      const props = p.properties;
      const name = getTitle(props, "Name");
      const computed = computedStat(name);
      return {
        id: p.id,
        notionUrl: p.url,
        name,
        icon: getRichText(props, "Icon") || "📁",
        description: getRichText(props, "Description"),
        statLabel: computed ?? (getRichText(props, "Stat Label") || null), // null → front-end shows "No data yet"
        statTrend: getRichText(props, "Stat Trend") || null,
        route: props["Route"]?.url || null,
        accentColor: getSelect(props, "Accent Color") || "Gray",
        type: getSelect(props, "Type") || "Business",
        status: getSelect(props, "Status") || "Coming soon",
        order: getNumber(props, "Order") ?? 999,
      };
    });

    res.status(200).json({
      source: "notion-live",
      fetchedAt: new Date().toISOString(),
      workspaces,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
