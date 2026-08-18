// GET /api/gustos-data
// REBUILT (Aug 16) for "Mis Gustos & Conocimiento" — a knowledge/interest
// system, not a learning-stats dashboard. Reads the real Referencias
// database (now extended with Autor, Columna, Tags, Importancia).
//
// Kept the filename to avoid adding a new serverless function — Vercel's
// Hobby plan caps deployments at 12, and this project is already at that
// limit after today's earlier fix.

const { queryDatabase, getTitle, getRichText, getSelect, getNumber } = require("./_notion");

const DB_REFERENCIAS = process.env.NOTION_DB_REFERENCIAS || "7456b43c-50ef-4e15-bea4-ab2f824add71";

function getMultiSelect(props, key) {
  return (props[key]?.multi_select || []).map((o) => o.name);
}
function getUrl(props, key) {
  return props[key]?.url || null;
}

const NOTION_VERSION = "2025-09-03";
const NOTION_TOKEN = process.env.NOTION_TOKEN;

function headers() {
  return { Authorization: `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" };
}

async function handleReferenceDetail(req, res) {
  const pageId = req.query?.pageId;
  if (!pageId) { res.status(400).json({ error: "pageId is required" }); return; }
  const [pageRes, commentsRes] = await Promise.all([
    fetch(`https://api.notion.com/v1/pages/${pageId}`, { headers: headers() }),
    fetch(`https://api.notion.com/v1/comments?block_id=${pageId}`, { headers: headers() }),
  ]);
  if (!pageRes.ok) throw new Error(`Notion page fetch failed (${pageRes.status}): ${await pageRes.text()}`);
  const page = await pageRes.json();
  const props = page.properties;
  let comments = [];
  if (commentsRes.ok) {
    const commentsData = await commentsRes.json();
    comments = (commentsData.results || []).map((c) => ({
      id: c.id, text: (c.rich_text || []).map((t) => t.plain_text).join(""), createdTime: c.created_time,
    }));
  }
  res.status(200).json({
    id: page.id, notionUrl: page.url,
    referencia: getTitle(props, "Referencia"), autor: getRichText(props, "Autor"),
    columna: getRichText(props, "Columna"), tipo: getSelect(props, "Tipo"),
    temas: getMultiSelect(props, "Tema"), tags: getMultiSelect(props, "Tags"),
    enlace: getUrl(props, "Enlace"), estado: getSelect(props, "Estado"),
    porQueMeInteresa: getRichText(props, "Por qué me interesa"),
    importancia: getNumber(props, "Importancia"), comments,
    attachments: (props["Attachments"]?.files || []).map((f) => ({
      name: f.name, url: f.type === "file" ? f.file?.url : f.external?.url,
    })),
  });
}

module.exports = async (req, res) => {
  try {
    if (req.method === "GET" && req.query?.action === "detail") return await handleReferenceDetail(req, res);
    const pages = await queryDatabase(DB_REFERENCIAS, {
      sorts: [{ property: "Referencia", direction: "ascending" }],
    });

    const referencias = pages.map((p) => ({
      id: p.id,
      notionUrl: p.url,
      referencia: getTitle(p.properties, "Referencia"),
      autor: getRichText(p.properties, "Autor"),
      columna: getRichText(p.properties, "Columna") || "Sin columna",
      tipo: getSelect(p.properties, "Tipo"),
      temas: getMultiSelect(p.properties, "Tema"),
      tags: getMultiSelect(p.properties, "Tags"),
      enlace: getUrl(p.properties, "Enlace"),
      estado: getSelect(p.properties, "Estado"),
      porQueMeInteresa: getRichText(p.properties, "Por qué me interesa"),
      importancia: getNumber(p.properties, "Importancia"),
      createdTime: p.created_time,
    }));

    // Real topic counts from actual references...
    const temaCounts = {};
    referencias.forEach((r) => r.temas.forEach((t) => (temaCounts[t] = (temaCounts[t] || 0) + 1)));

    // ...but a brand-new topic (created via "+ Nuevo tema", which adds a
    // real option to the Tema schema) has zero references yet, so it would
    // never show up if the list only came from counting references. Fetch
    // the full schema option list too and merge, so a topic appears the
    // moment it's created — not only after something's tagged with it.
    let topicNames = Object.keys(temaCounts);
    try {
      const schemaRes = await fetch(`https://api.notion.com/v1/data_sources/${DB_REFERENCIAS}`, {
        headers: { Authorization: `Bearer ${process.env.NOTION_TOKEN}`, "Notion-Version": "2025-09-03" },
      });
      if (schemaRes.ok) {
        const schema = await schemaRes.json();
        const schemaTopics = (schema.properties?.["Tema"]?.multi_select?.options || []).map((o) => o.name);
        topicNames = [...new Set([...schemaTopics, ...topicNames])];
      }
    } catch (e) { /* falls back to reference-derived topics only */ }
    const topics = topicNames.map((name) => ({ name, count: temaCounts[name] || 0 })).sort((a, b) => b.count - a.count);

    // Recent references — real, sorted by actual creation time
    const recent = [...referencias].sort((a, b) => new Date(b.createdTime) - new Date(a.createdTime)).slice(0, 8);

    // Topic Cloud — from real Tags (not Temas), matching Aurelio's request
    // to keep the cloud instead of "Discovery of the Week"
    const tagCounts = {};
    referencias.forEach((r) => r.tags.forEach((t) => (tagCounts[t] = (tagCounts[t] || 0) + 1)));
    const tagCloud = Object.entries(tagCounts).map(([word, weight]) => ({ word, weight })).sort((a, b) => b.weight - a.weight);

    // Knowledge Map — real co-occurrence: which tags actually appear
    // together with each topic's references, not invented connections.
    const knowledgeMap = topics.slice(0, 6).map((topic) => {
      const refsInTopic = referencias.filter((r) => r.temas.includes(topic.name));
      const relatedTags = {};
      refsInTopic.forEach((r) => r.tags.forEach((t) => (relatedTags[t] = (relatedTags[t] || 0) + 1)));
      return {
        topic: topic.name,
        connections: Object.entries(relatedTags).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([name]) => name),
      };
    });

    res.status(200).json({
      source: "notion-live",
      fetchedAt: new Date().toISOString(),
      referencias,
      topics,
      recent,
      tagCloud,
      knowledgeMap,
      stats: {
        totalReferencias: referencias.length,
        totalTopics: topics.length,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
