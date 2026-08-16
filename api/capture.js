// POST /api/capture — consolidated Knowledge write endpoint.
// REBUILT (Aug 16) for "Mis Gustos & Conocimiento". Kept this filename
// (was the old quick-capture endpoint) rather than adding a new file —
// same Vercel 12-function reason as gustos-data.js.
//
// Body: { action: "create-reference", referencia, autor?, columna?, tipo?, temas?, tags?, enlace?, estado?, porQueMeInteresa?, importancia? }
// Body: { action: "update-reference", pageId, ...same fields... }
// Body: { action: "create-topic", name }  — adds a real new Tema option
// Body: { action: "comment", pageId, text }
// Body: { action: "delete-reference", pageId }

const NOTION_VERSION = "2025-09-03";
const NOTION_TOKEN = process.env.NOTION_TOKEN;
const DB_REFERENCIAS = process.env.NOTION_DB_REFERENCIAS || "7456b43c-50ef-4e15-bea4-ab2f824add71";
const DB_ARISTOTELES_DOCS = process.env.NOTION_DB_ARISTOTELES_DOCS || "650f515d-4540-4a67-9066-f04b0944e394";

function headers() {
  return { Authorization: `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" };
}

function buildProperties(body) {
  const { referencia, autor, columna, tipo, temas, tags, enlace, estado, porQueMeInteresa, importancia } = body;
  const properties = {};
  if (referencia !== undefined) properties["Referencia"] = { title: [{ text: { content: referencia } }] };
  if (autor !== undefined) properties["Autor"] = { rich_text: [{ text: { content: autor || "" } }] };
  if (columna !== undefined) properties["Columna"] = { rich_text: [{ text: { content: columna || "" } }] };
  if (tipo !== undefined) properties["Tipo"] = tipo ? { select: { name: tipo } } : { select: null };
  if (temas !== undefined) properties["Tema"] = { multi_select: (temas || []).map((t) => ({ name: t })) };
  if (tags !== undefined) properties["Tags"] = { multi_select: (tags || []).map((t) => ({ name: t })) };
  if (enlace !== undefined) properties["Enlace"] = enlace ? { url: enlace } : { url: null };
  if (estado !== undefined) properties["Estado"] = estado ? { select: { name: estado } } : { select: null };
  if (porQueMeInteresa !== undefined) properties["Por qué me interesa"] = { rich_text: [{ text: { content: porQueMeInteresa || "" } }] };
  if (importancia !== undefined) properties["Importancia"] = importancia ? { number: Number(importancia) } : { number: null };
  return properties;
}

async function handleCreateReference(req, res) {
  const { referencia } = req.body || {};
  if (!referencia || !referencia.trim()) { res.status(400).json({ ok: false, error: "referencia is required" }); return; }
  const properties = buildProperties(req.body);
  properties["Estado"] = properties["Estado"] || { select: { name: "Por consumir" } };
  const r = await fetch("https://api.notion.com/v1/pages", {
    method: "POST", headers: headers(),
    body: JSON.stringify({ parent: { type: "data_source_id", data_source_id: DB_REFERENCIAS }, properties }),
  });
  if (!r.ok) throw new Error(`Notion create failed (${r.status}): ${await r.text()}`);
  const page = await r.json();
  res.status(200).json({ ok: true, pageId: page.id });
}

async function handleUpdateReference(req, res) {
  const { pageId } = req.body || {};
  if (!pageId) { res.status(400).json({ ok: false, error: "pageId is required" }); return; }
  const properties = buildProperties(req.body);
  const r = await fetch(`https://api.notion.com/v1/pages/${pageId}`, { method: "PATCH", headers: headers(), body: JSON.stringify({ properties }) });
  if (!r.ok) throw new Error(`Notion update failed (${r.status}): ${await r.text()}`);
  res.status(200).json({ ok: true });
}

async function handleDeleteReference(req, res) {
  const { pageId } = req.body || {};
  if (!pageId) { res.status(400).json({ ok: false, error: "pageId is required" }); return; }
  const r = await fetch(`https://api.notion.com/v1/pages/${pageId}`, { method: "PATCH", headers: headers(), body: JSON.stringify({ archived: true }) });
  if (!r.ok) throw new Error(`Notion archive failed (${r.status}): ${await r.text()}`);
  res.status(200).json({ ok: true });
}

// Fetches the full current Tema option list, then re-submits it plus the
// new one — Notion requires the complete option set on every schema
// update, same pattern used earlier today for Master Actions' Project
// field.
async function handleCreateTopic(req, res) {
  const { name } = req.body || {};
  if (!name || !name.trim()) { res.status(400).json({ ok: false, error: "name is required" }); return; }
  const schemaRes = await fetch(`https://api.notion.com/v1/data_sources/${DB_REFERENCIAS}`, { headers: headers() });
  if (!schemaRes.ok) throw new Error(`Notion schema fetch failed (${schemaRes.status}): ${await schemaRes.text()}`);
  const schema = await schemaRes.json();
  const temaProp = schema.properties?.["Tema"];
  if (!temaProp || temaProp.type !== "multi_select") throw new Error("Tema property not found or not multi_select");
  const existingNames = (temaProp.multi_select.options || []).map((o) => o.name);
  if (existingNames.some((n) => n.toLowerCase() === name.trim().toLowerCase())) {
    res.status(200).json({ ok: true, alreadyExists: true });
    return;
  }
  const newOptions = [...temaProp.multi_select.options.map((o) => ({ name: o.name, color: o.color })), { name: name.trim(), color: "default" }];
  const patchRes = await fetch(`https://api.notion.com/v1/data_sources/${DB_REFERENCIAS}`, {
    method: "PATCH", headers: headers(),
    body: JSON.stringify({ properties: { "Tema": { multi_select: { options: newOptions } } } }),
  });
  if (!patchRes.ok) throw new Error(`Notion schema update failed (${patchRes.status}): ${await patchRes.text()}`);
  res.status(200).json({ ok: true });
}

async function handleComment(req, res) {
  const { pageId, text } = req.body || {};
  if (!pageId || !text || !text.trim()) { res.status(400).json({ ok: false, error: "pageId and text are required" }); return; }
  const r = await fetch("https://api.notion.com/v1/comments", {
    method: "POST", headers: headers(),
    body: JSON.stringify({ parent: { page_id: pageId }, rich_text: [{ text: { content: text.trim() } }] }),
  });
  if (!r.ok) throw new Error(`Notion comment failed (${r.status}): ${await r.text()}`);
  res.status(200).json({ ok: true });
}

// ---- Aristóteles: new document / new section ----
async function handleCreateAristotelesDoc(req, res) {
  const { documento, seccion } = req.body || {};
  if (!documento || !documento.trim()) { res.status(400).json({ ok: false, error: "documento is required" }); return; }
  if (!seccion) { res.status(400).json({ ok: false, error: "seccion is required" }); return; }
  const r = await fetch("https://api.notion.com/v1/pages", {
    method: "POST", headers: headers(),
    body: JSON.stringify({
      parent: { type: "data_source_id", data_source_id: DB_ARISTOTELES_DOCS },
      properties: {
        Documento: { title: [{ text: { content: documento.trim() } }] },
        Sección: { select: { name: seccion } },
        Estado: { select: { name: "Vacío" } },
      },
    }),
  });
  if (!r.ok) throw new Error(`Notion create failed (${r.status}): ${await r.text()}`);
  const page = await r.json();
  res.status(200).json({ ok: true, pageId: page.id, notionUrl: page.url });
}

// Adds a real new Sección option — same full-option-resubmit pattern as
// create-topic, since Notion requires the complete list on every update.
async function handleCreateAristotelesSection(req, res) {
  const { name } = req.body || {};
  if (!name || !name.trim()) { res.status(400).json({ ok: false, error: "name is required" }); return; }
  const schemaRes = await fetch(`https://api.notion.com/v1/data_sources/${DB_ARISTOTELES_DOCS}`, { headers: headers() });
  if (!schemaRes.ok) throw new Error(`Notion schema fetch failed (${schemaRes.status}): ${await schemaRes.text()}`);
  const schema = await schemaRes.json();
  const seccionProp = schema.properties?.["Sección"];
  if (!seccionProp || seccionProp.type !== "select") throw new Error("Sección property not found or not select");
  const existingNames = (seccionProp.select.options || []).map((o) => o.name);
  if (existingNames.some((n) => n.toLowerCase() === name.trim().toLowerCase())) {
    res.status(200).json({ ok: true, alreadyExists: true });
    return;
  }
  const newOptions = [...seccionProp.select.options.map((o) => ({ name: o.name, color: o.color })), { name: name.trim(), color: "default" }];
  const patchRes = await fetch(`https://api.notion.com/v1/data_sources/${DB_ARISTOTELES_DOCS}`, {
    method: "PATCH", headers: headers(),
    body: JSON.stringify({ properties: { "Sección": { select: { options: newOptions } } } }),
  });
  if (!patchRes.ok) throw new Error(`Notion schema update failed (${patchRes.status}): ${await patchRes.text()}`);
  res.status(200).json({ ok: true });
}

module.exports = async (req, res) => {
  if (req.method !== "POST") { res.status(405).json({ error: "Use POST" }); return; }
  if (!NOTION_TOKEN) { res.status(200).json({ ok: false, error: "NOTION_TOKEN not set" }); return; }
  try {
    const action = req.body?.action;
    if (action === "create-reference") return await handleCreateReference(req, res);
    if (action === "update-reference") return await handleUpdateReference(req, res);
    if (action === "delete-reference") return await handleDeleteReference(req, res);
    if (action === "create-topic") return await handleCreateTopic(req, res);
    if (action === "comment") return await handleComment(req, res);
    if (action === "create-aristoteles-doc") return await handleCreateAristotelesDoc(req, res);
    if (action === "create-aristoteles-section") return await handleCreateAristotelesSection(req, res);
    res.status(400).json({ ok: false, error: "Unknown or missing action" });
  } catch (err) {
    console.error(err);
    res.status(200).json({ ok: false, error: err.message });
  }
};
