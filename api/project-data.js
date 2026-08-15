// GET /api/project-data?project=<any-project-name-or-slug>
// Generic Command Center endpoint for any pre-revenue project — not just
// RoutePup/Nikita/StatStrike. Looks the project up by name in the real
// Projects database (7 real rows: One Night Guest, RoutePup, Nikita,
// StatStrike, Personal, Aristóteles, Transversal — plus whatever gets
// added later), so a brand-new project automatically gets a working
// dashboard with zero code changes — matching Aurelio's ask not to have
// to "rebuild an operating system every time I start a project."
//
// FIX (Aug 15): this file had its own separate fetch logic (not the
// shared _notion.js helper) still pointed at the deprecated
// /v1/databases/{id}/query endpoint with Notion-Version 2022-06-28 — the
// exact bug already found and fixed in _notion.js for ong-data.js and
// tasks-data.js, just never applied here. RoutePup/Nikita/StatStrike were
// very likely returning 404s in production this whole time. Fixed by
// switching to /v1/data_sources/{id}/query with Notion-Version 2025-09-03.
//
// Honest by design: there is no revenue/leads/funnel data source for any
// pre-revenue project — so this endpoint never invents those fields. The
// frontend simply doesn't render sections with no backing data.

const NOTION_VERSION = "2025-09-03";
const NOTION_TOKEN = process.env.NOTION_TOKEN;

const DB_ACTIONS = process.env.NOTION_DB_ACTIONS || "de671725-0aef-44f7-9ec4-a577b1c7e254";
const DB_ENTITIES = process.env.NOTION_DB_ENTITIES || "f964fea0-c3d9-478b-8790-7eaa70a19b00";
const DB_PROJECTS = process.env.NOTION_DB_PROJECTS || "1d136483-524c-4045-b466-109e1f333f1e";
const DB_ROUTEPUP_CARDS = process.env.NOTION_DB_ROUTEPUP_CARDS || "f9fc7996-b03d-4ed2-bb16-fa2d616d8e46";

// The only project-specific special case left — RoutePup has a real,
// substantial "Tarjetas" spec database nothing else has yet. Everything
// else about every project is fully generic.
const CARDS_DB_BY_PROJECT = { "RoutePup": DB_ROUTEPUP_CARDS };
const ICON_BY_PROJECT = { "RoutePup": "🐾", "Nikita": "🤖", "StatStrike": "📊", "Transversal": "🔗" };

function slugify(s) {
  return (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
}

async function notionQuery(dataSourceId, body = {}) {
  const res = await fetch(`https://api.notion.com/v1/data_sources/${dataSourceId}/query`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${NOTION_TOKEN}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Notion query failed (${res.status}) for ${dataSourceId}: ${text}`);
  }
  return res.json();
}

function text(prop) {
  if (!prop) return "";
  if (prop.type === "title") return (prop.title || []).map(t => t.plain_text).join("");
  if (prop.type === "rich_text") return (prop.rich_text || []).map(t => t.plain_text).join("");
  return "";
}
function select(prop) { return prop?.select?.name || null; }

module.exports = async (req, res) => {
  const key = (req.query?.project || "").toLowerCase();
  if (!key) {
    res.status(400).json({ error: "Missing ?project= parameter." });
    return;
  }
  if (!NOTION_TOKEN) {
    res.status(200).json({ error: "NOTION_TOKEN not set", areas: [], tasks: [], cards: [] });
    return;
  }

  try {
    const projectsRes = await notionQuery(DB_PROJECTS, {});
    const match = (projectsRes.results || []).find(p => {
      const name = text(p.properties["Project Name"]);
      return slugify(name) === key;
    });
    if (!match) {
      res.status(404).json({ error: `No project found matching "${key}" in the Projects database.` });
      return;
    }
    const projectName = text(match.properties["Project Name"]);
    const cardsDb = CARDS_DB_BY_PROJECT[projectName] || null;
    const icon = ICON_BY_PROJECT[projectName] || "🗂️";

    const [entitiesRes, actionsRes] = await Promise.all([
      notionQuery(DB_ENTITIES, {
        filter: { property: "Empresa", select: { equals: projectName } },
        sorts: [{ property: "Entity Name", direction: "ascending" }],
      }),
      notionQuery(DB_ACTIONS, {
        filter: { property: "Project", select: { equals: projectName } },
        sorts: [{ property: "Priority", direction: "ascending" }],
      }),
    ]);

    const areas = (entitiesRes.results || []).map(p => ({
      id: p.id,
      name: text(p.properties["Entity Name"]),
      status: select(p.properties["Status"]),
    }));

    const tasks = (actionsRes.results || []).map(p => ({
      id: p.id,
      name: text(p.properties["Task Name"]),
      status: select(p.properties["Status"]),
      priority: select(p.properties["Priority"]),
      blocksLaunch: !!p.properties["Blocks Launch"]?.checkbox,
    }));

    let cards = [];
    if (cardsDb) {
      const cardsRes = await notionQuery(cardsDb, {});
      cards = (cardsRes.results || []).map(p => ({
        id: p.id,
        name: text(p.properties["Tarjeta"]),
        lista: select(p.properties["Lista"]),
        estado: select(p.properties["Estado"]),
      }));
    }

    res.status(200).json({
      project: { key, label: projectName, icon },
      areas,
      tasks,
      stats: {
        totalTasks: tasks.length,
        critical: tasks.filter(t => t.priority === "P0" && t.status !== "Terminado").length,
        blocked: tasks.filter(t => t.status === "Bloqueado").length,
        onTrack: tasks.filter(t => t.status === "En progreso").length,
        totalAreas: areas.length,
      },
      cards,
      hasCards: !!cardsDb,
    });
  } catch (err) {
    console.error(err);
    res.status(200).json({ error: err.message, areas: [], tasks: [], cards: [] });
  }
};
