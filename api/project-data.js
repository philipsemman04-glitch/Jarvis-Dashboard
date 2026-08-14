// GET /api/project-data?project=routepup|nikita|statstrike
// Shared endpoint for the three pre-revenue project Command Centers.
// Honest by design: there is no revenue/leads/funnel data source for any
// of these three projects at all (unlike ONG, which has CRM/Leads and
// Budget/KPIs) — so this endpoint never returns those fields. The
// frontend simply doesn't render sections that have no backing data,
// rather than showing "No data yet" for a metric category that doesn't
// conceptually exist yet either.

const NOTION_VERSION = "2022-06-28";
const NOTION_TOKEN = process.env.NOTION_TOKEN;

const DB_ACTIONS = process.env.NOTION_DB_ACTIONS || "de671725-0aef-44f7-9ec4-a577b1c7e254";
const DB_ENTITIES = process.env.NOTION_DB_ENTITIES || "f964fea0-c3d9-478b-8790-7eaa70a19b00";
const DB_ROUTEPUP_CARDS = process.env.NOTION_DB_ROUTEPUP_CARDS || "f9fc7996-b03d-4ed2-bb16-fa2d616d8e46";

const PROJECTS = {
  routepup: { label: "RoutePup", icon: "🐾", cardsDb: DB_ROUTEPUP_CARDS },
  nikita: { label: "Nikita", icon: "🤖", cardsDb: null },
  statstrike: { label: "StatStrike", icon: "📊", cardsDb: null },
};

async function notionQuery(databaseId, body = {}) {
  const res = await fetch(`https://api.notion.com/v1/databases/${databaseId}/query`, {
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
    throw new Error(`Notion query failed (${res.status}) for ${databaseId}: ${text}`);
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
  const config = PROJECTS[key];
  if (!config) {
    res.status(400).json({ error: `Unknown project "${key}". Use routepup, nikita, or statstrike.` });
    return;
  }
  if (!NOTION_TOKEN) {
    res.status(200).json({ error: "NOTION_TOKEN not set", project: config, areas: [], tasks: [], cards: [] });
    return;
  }

  try {
    const [entitiesRes, actionsRes] = await Promise.all([
      notionQuery(DB_ENTITIES, {
        filter: { property: "Empresa", select: { equals: config.label } },
        sorts: [{ property: "Entity Name", direction: "ascending" }],
      }),
      notionQuery(DB_ACTIONS, {
        filter: { property: "Project", select: { equals: config.label } },
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
    if (config.cardsDb) {
      const cardsRes = await notionQuery(config.cardsDb, {});
      cards = (cardsRes.results || []).map(p => ({
        id: p.id,
        name: text(p.properties["Tarjeta"]),
        lista: select(p.properties["Lista"]),
        estado: select(p.properties["Estado"]),
      }));
    }

    res.status(200).json({
      project: { key, label: config.label, icon: config.icon },
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
      hasCards: !!config.cardsDb,
    });
  } catch (err) {
    console.error(err);
    res.status(200).json({ error: err.message, project: config, areas: [], tasks: [], cards: [] });
  }
};
