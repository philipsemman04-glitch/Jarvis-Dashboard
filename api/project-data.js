// GET /api/project-data?project=<any-project-name-or-slug>
// Generic Command Center endpoint for any pre-revenue project.
//
// FIX (Aug 15, round 2): areas were previously just a flat list with no
// connection to anything — clicking one did nothing, and RoutePup's 73
// cards had no link to any area at all (their "Lista" field turned out to
// be a content-type label, not an area — e.g. "Desarrollo" mixed Business
// Plan, legal policy, and UI screens together). Added a real "Área"
// relation on RoutePup — Tarjetas, manually categorized all 73 cards by
// actual content, and this endpoint now returns cards grouped by their
// real area so the dashboard can do real Project → Area → Info drill-down,
// per Aurelio's explicit ask.
//
// Tasks now link to a specific area too, via "Related Entity" — a
// relation field that already existed in Master Actions' schema but was
// never populated or wired into any dashboard. create-task.js can now set
// it (areaId param), and this endpoint reads it the same way it reads
// card→area links, so both datasets filter together when an area is
// clicked.

const NOTION_VERSION = "2025-09-03";
const NOTION_TOKEN = process.env.NOTION_TOKEN;

const DB_ACTIONS = process.env.NOTION_DB_ACTIONS || "de671725-0aef-44f7-9ec4-a577b1c7e254";
const DB_ENTITIES = process.env.NOTION_DB_ENTITIES || "f964fea0-c3d9-478b-8790-7eaa70a19b00";
const DB_PROJECTS = process.env.NOTION_DB_PROJECTS || "1d136483-524c-4045-b466-109e1f333f1e";
const DB_ROUTEPUP_CARDS = process.env.NOTION_DB_ROUTEPUP_CARDS || "f9fc7996-b03d-4ed2-bb16-fa2d616d8e46";
const DB_ARISTOTELES_DOCS = process.env.NOTION_DB_ARISTOTELES_DOCS || "650f515d-4540-4a67-9066-f04b0944e394";

// Aug 16: order + short descriptions matching Aurelio's own written spec —
// text only, no invented content. A section with no real documents still
// shows here (0 documents), never hidden or faked as "in progress."
const ARISTOTELES_SECTIONS = [
  { name: "Mi Historia", icon: "📖", desc: "Mi pasado, infancia, familia, formación, carrera y experiencias clave." },
  { name: "Quién Soy", icon: "👤", desc: "Quién soy hoy, mi esencia actual y mi identidad." },
  { name: "Valores", icon: "💎", desc: "Principios y valores que guían mis decisiones." },
  { name: "Personalidad", icon: "🎭", desc: "Rasgos, comportamiento, tendencias y características." },
  { name: "Fortalezas", icon: "💪", desc: "Mis fortalezas naturales y desarrolladas." },
  { name: "Debilidades", icon: "⚠️", desc: "Áreas que necesito mejorar o trabajar." },
  { name: "Qué me da energía", icon: "⚡", desc: "Personas, actividades y situaciones que me impulsan y me hacen mejor." },
  { name: "Qué me quita energía", icon: "🔋", desc: "Lo que me drena, me estresa o me desconecta." },
  { name: "Cómo funciona mi mente", icon: "🧠", desc: "Mis patrones de pensamiento, decisión, trabajo y enfoque." },
  { name: "Momentos de Inflexión", icon: "⭐", desc: "Eventos o decisiones que cambiaron el rumbo de mi vida." },
  { name: "Objetivos", icon: "🎯", desc: "Objetivos personales y profesionales importantes." },
  { name: "Visión a 10 años", icon: "👁️", desc: "Dónde quiero estar y qué quiero lograr en el largo plazo." },
  { name: "Líneas de Investigación", icon: "🔍", desc: "Temas que quiero entender o investigar más a fondo." },
  { name: "Registro de Cambios", icon: "🔄", desc: "Evolución personal, cambios de mentalidad y decisiones clave." },
  { name: "Contexto Actual", icon: "📅", desc: "Qué está pasando en mi vida, qué me enfoco y qué cambia." },
];

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
function relationIds(prop) { return (prop?.relation || []).map(r => r.id); }

async function handleAristoteles(req, res) {
  const docsRes = await notionQuery(DB_ARISTOTELES_DOCS, {});
  const docs = (docsRes.results || []).map(p => ({
    id: p.id,
    notionUrl: p.url,
    name: text(p.properties["Documento"]),
    seccion: select(p.properties["Sección"]),
    estado: select(p.properties["Estado"]),
    lastEditedTime: p.last_edited_time,
    createdTime: p.created_time,
  }));

  const docCountBySeccion = {};
  docs.forEach(d => { if (d.seccion) docCountBySeccion[d.seccion] = (docCountBySeccion[d.seccion] || 0) + 1; });

  const sections = ARISTOTELES_SECTIONS.map(s => ({
    ...s,
    count: docCountBySeccion[s.name] || 0,
  }));

  const sectionsWithInfo = sections.filter(s => s.count > 0).length;
  const recent = [...docs].sort((a, b) => new Date(b.lastEditedTime) - new Date(a.lastEditedTime)).slice(0, 6);

  res.status(200).json({
    project: { key: "aristoteles", label: "Aristóteles", icon: "🦉" },
    isAristoteles: true,
    sections,
    docs,
    recent,
    stats: {
      totalDocs: docs.length,
      sectionsWithInfo,
      sectionsPending: sections.length - sectionsWithInfo,
      totalSections: sections.length,
    },
  });
}

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
    if (key === "aristoteles") return await handleAristoteles(req, res);

    const projectsRes = await notionQuery(DB_PROJECTS, {});
    const match = (projectsRes.results || []).find(p => slugify(text(p.properties["Project Name"])) === key);
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
    const areaIdSet = new Set(areas.map(a => a.id));

    const tasks = (actionsRes.results || []).map(p => {
      const taskAreaIds = relationIds(p.properties["Related Entity"]).filter(id => areaIdSet.has(id));
      return {
        id: p.id,
        name: text(p.properties["Task Name"]),
        status: select(p.properties["Status"]),
        priority: select(p.properties["Priority"]),
        blocksLaunch: !!p.properties["Blocks Launch"]?.checkbox,
        areaId: taskAreaIds[0] || null,
      };
    });

    let cards = [];
    if (cardsDb) {
      const cardsRes = await notionQuery(cardsDb, {});
      cards = (cardsRes.results || []).map(p => {
        const areaIds = relationIds(p.properties["Área"]).filter(id => areaIdSet.has(id));
        return {
          id: p.id,
          name: text(p.properties["Tarjeta"]),
          tipo: select(p.properties["Tipo"]),
          estado: select(p.properties["Estado"]),
          areaId: areaIds[0] || null,
        };
      });
    }

    // Card AND task counts per area, so the dashboard can show real counts
    // and filter either dataset when an area is clicked.
    const cardCountByArea = {};
    cards.forEach(c => { if (c.areaId) cardCountByArea[c.areaId] = (cardCountByArea[c.areaId] || 0) + 1; });
    const taskCountByArea = {};
    tasks.forEach(t => { if (t.areaId) taskCountByArea[t.areaId] = (taskCountByArea[t.areaId] || 0) + 1; });
    areas.forEach(a => {
      a.cardCount = cardCountByArea[a.id] || 0;
      a.taskCount = taskCountByArea[a.id] || 0;
    });

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
      cardsLinkedToAreas: cardsDb ? cards.every(c => c.areaId != null) : null,
    });
  } catch (err) {
    console.error(err);
    res.status(200).json({ error: err.message, areas: [], tasks: [], cards: [] });
  }
};
