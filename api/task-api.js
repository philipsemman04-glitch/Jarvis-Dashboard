// /api/task-api — consolidated task endpoint.
//
// FIX (Aug 16): Vercel's Hobby plan caps deployments at 12 serverless
// functions. Today's build had grown to 17 separate small files
// (create-task, update-action, update-task, update-task-area,
// task-detail, task-comment, plus everything else), which silently
// failed every deployment with "No more than 12 Serverless Functions..."
// — Vercel kept serving an old broken version while every dashboard
// looked like a Notion connection failure. This file merges 6 of those
// into 1, using an `action` field to dispatch, without changing what any
// of them actually do.
//
// GET  /api/task-api?action=detail&pageId=X
// POST /api/task-api  body: { action: "create"|"update-status"|"update-full"|"update-area"|"comment", ... }

const { createPage, updatePage, queryDatabase, getTitle } = require("./_notion");

const NOTION_VERSION = "2025-09-03";
const NOTION_TOKEN = process.env.NOTION_TOKEN;
const DB_ACTIONS = process.env.NOTION_DB_ACTIONS || "de671725-0aef-44f7-9ec4-a577b1c7e254";
const DB_ENTITIES = process.env.NOTION_DB_ENTITIES || "f964fea0-c3d9-478b-8790-7eaa70a19b00";

function headers() {
  return { Authorization: `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" };
}
function text(prop) {
  if (!prop) return "";
  if (prop.type === "title") return (prop.title || []).map(t => t.plain_text).join("");
  if (prop.type === "rich_text") return (prop.rich_text || []).map(t => t.plain_text).join("");
  return "";
}
function select(prop) { return prop?.select?.name || null; }
function relationIds(prop) { return (prop?.relation || []).map(r => r.id); }
function fileList(prop) {
  return (prop?.files || []).map(f => ({
    name: f.name,
    url: f.type === "file" ? f.file?.url : f.external?.url,
  }));
}

async function handleDetail(req, res) {
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
    comments = (commentsData.results || []).map(c => ({
      id: c.id, text: (c.rich_text || []).map(t => t.plain_text).join(""),
      author: c.created_by?.id || "unknown", createdTime: c.created_time,
    }));
  }
  res.status(200).json({
    id: page.id, notionUrl: page.url,
    taskName: text(props["Task Name"]), description: text(props["Description"]),
    status: select(props["Status"]), priority: select(props["Priority"]), priorityLevel: select(props["Priority Level"]),
    collaborators: text(props["Collaborators"]), targetDate: props["Target Date"]?.date?.start || null,
    areaIds: relationIds(props["Related Entity"]), tags: (props["Tags"]?.multi_select || []).map(t => t.name),
    attachments: fileList(props["Attachments"]),
    comments,
  });
}

async function handleCreate(req, res) {
  const { taskName, project, priority, priorityLevel, targetDate, area, description } = req.body || {};
  if (!taskName || !taskName.trim()) { res.status(400).json({ error: "taskName is required" }); return; }
  const properties = {
    "Task Name": { title: [{ text: { content: taskName.trim() } }] },
    Status: { select: { name: "No iniciado" } },
  };
  if (priority) properties["Priority"] = { select: { name: priority } };
  if (priorityLevel) properties["Priority Level"] = { select: { name: priorityLevel } };
  if (project && project !== "Sin proyecto") properties["Project"] = { select: { name: project } };
  if (targetDate) properties["Target Date"] = { date: { start: targetDate } };
  if (description) properties["Description"] = { rich_text: [{ text: { content: description } }] };

  let areaMatched = null, areaWarning = null;
  if (area && area.trim() && project) {
    const entityPages = await queryDatabase(DB_ENTITIES, { filter: { property: "Empresa", select: { equals: project } } });
    const target = area.trim().toLowerCase();
    const match = entityPages.find((p) => getTitle(p.properties, "Entity Name").toLowerCase() === target);
    if (match) {
      areaMatched = getTitle(match.properties, "Entity Name");
      properties["Related Entity"] = { relation: [{ id: match.id }] };
    } else {
      areaWarning = `No area named "${area}" found under ${project}. Real areas: ${entityPages.map(p => getTitle(p.properties, "Entity Name")).join(", ")}.`;
    }
  }
  const page = await createPage(DB_ACTIONS, properties);
  res.status(200).json({ ok: true, pageId: page.id, areaMatched, areaWarning });
}

async function handleUpdateStatus(req, res) {
  const { pageId, status } = req.body || {};
  if (!pageId || !status) { res.status(400).json({ error: "pageId and status are required" }); return; }
  const properties = { Status: { select: { name: status } } };
  if (status === "Terminado") properties["Completion Date"] = { date: { start: new Date().toISOString().slice(0, 10) } };
  const result = await updatePage(pageId, properties);
  res.status(200).json({ ok: true, pageId: result.id });
}

async function handleUpdateFull(req, res) {
  const { pageId, taskName, description, status, priority, priorityLevel, collaborators, targetDate } = req.body || {};
  if (!pageId) { res.status(400).json({ error: "pageId is required" }); return; }
  const properties = {};
  if (taskName !== undefined) properties["Task Name"] = { title: [{ text: { content: taskName } }] };
  if (description !== undefined) properties["Description"] = { rich_text: [{ text: { content: description } }] };
  if (status !== undefined) {
    properties["Status"] = { select: { name: status } };
    if (status === "Terminado") properties["Completion Date"] = { date: { start: new Date().toISOString().slice(0, 10) } };
  }
  if (priority !== undefined) properties["Priority"] = { select: { name: priority } };
  if (priorityLevel !== undefined) properties["Priority Level"] = priorityLevel ? { select: { name: priorityLevel } } : { select: null };
  if (collaborators !== undefined) properties["Collaborators"] = { rich_text: [{ text: { content: collaborators } }] };
  if (targetDate !== undefined) properties["Target Date"] = targetDate ? { date: { start: targetDate } } : { date: null };
  const result = await updatePage(pageId, properties);
  res.status(200).json({ ok: true, pageId: result.id });
}

async function handleUpdateArea(req, res) {
  const { pageId, area } = req.body || {};
  if (!pageId || !area) { res.status(400).json({ error: "pageId and area are required" }); return; }
  const entityPages = await queryDatabase(DB_ENTITIES, {});
  const target = area.trim().toLowerCase();
  const match = entityPages.find((p) => getTitle(p.properties, "Entity Name").toLowerCase() === target);
  if (!match) { res.status(404).json({ error: `No area named "${area}" found.` }); return; }
  const result = await updatePage(pageId, { "Related Entity": { relation: [{ id: match.id }] } });
  res.status(200).json({ ok: true, pageId: result.id });
}

async function handleComment(req, res) {
  const { pageId, text: commentText } = req.body || {};
  if (!pageId || !commentText || !commentText.trim()) { res.status(400).json({ ok: false, error: "pageId and text are required" }); return; }
  const r = await fetch("https://api.notion.com/v1/comments", {
    method: "POST", headers: headers(),
    body: JSON.stringify({ parent: { page_id: pageId }, rich_text: [{ text: { content: commentText.trim() } }] }),
  });
  if (!r.ok) throw new Error(`Notion comment failed (${r.status}): ${await r.text()}`);
  res.status(200).json({ ok: true });
}

// Real file/image upload, direct from Jarvis — Notion's File Upload API,
// two steps: (1) create an upload slot, (2) POST the bytes to it, then
// attach the finished upload to the page's Attachments property. Reads the
// page first so an existing attachment is never overwritten, only added to.
async function handleUpload(req, res) {
  const { pageId, filename, contentType, dataBase64 } = req.body || {};
  if (!pageId || !filename || !dataBase64) { res.status(400).json({ error: "pageId, filename and dataBase64 are required" }); return; }

  // Vercel's Serverless Functions have a hard ~4.5MB request payload limit
  // (this can't be raised via config for non-Next.js functions), and base64
  // inflates the raw file size by ~33% — so the real ceiling here is well
  // under Notion's own 20MB single-part upload limit.
  const MAX_BYTES = 3 * 1024 * 1024; // ~3MB raw file
  const buffer = Buffer.from(dataBase64, "base64");
  if (buffer.length > MAX_BYTES) { res.status(400).json({ error: "Archivo demasiado grande — el límite actual es 3MB." }); return; }

  const createRes = await fetch("https://api.notion.com/v1/file_uploads", {
    method: "POST", headers: headers(), body: JSON.stringify({}),
  });
  if (!createRes.ok) throw new Error(`Notion file_uploads create failed (${createRes.status}): ${await createRes.text()}`);
  const upload = await createRes.json();

  const form = new FormData();
  form.append("file", new Blob([buffer], { type: contentType || "application/octet-stream" }), filename);
  const sendRes = await fetch(upload.upload_url, {
    method: "POST",
    headers: { Authorization: `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION },
    body: form,
  });
  if (!sendRes.ok) throw new Error(`Notion file upload failed (${sendRes.status}): ${await sendRes.text()}`);

  const pageRes = await fetch(`https://api.notion.com/v1/pages/${pageId}`, { headers: headers() });
  if (!pageRes.ok) throw new Error(`Notion page fetch failed (${pageRes.status}): ${await pageRes.text()}`);
  const page = await pageRes.json();
  // Files & media properties are replaced wholesale on write, so every existing
  // attachment has to be resent alongside the new one or it gets silently
  // dropped. Passing back exactly what Notion returned on read is the safest
  // way to round-trip files we didn't just upload ourselves.
  const existingRaw = page.properties["Attachments"]?.files || [];

  const result = await updatePage(pageId, {
    Attachments: { files: [...existingRaw, { type: "file_upload", file_upload: { id: upload.id }, name: filename }] },
  });
  res.status(200).json({ ok: true, pageId: result.id, uploadId: upload.id });
}

module.exports = async (req, res) => {
  if (!NOTION_TOKEN) { res.status(200).json({ error: "NOTION_TOKEN not set" }); return; }
  try {
    if (req.method === "GET" && req.query?.action === "detail") return await handleDetail(req, res);
    if (req.method === "POST") {
      const action = req.body?.action;
      if (action === "create") return await handleCreate(req, res);
      if (action === "update-status") return await handleUpdateStatus(req, res);
      if (action === "update-full") return await handleUpdateFull(req, res);
      if (action === "update-area") return await handleUpdateArea(req, res);
      if (action === "comment") return await handleComment(req, res);
      if (action === "upload") return await handleUpload(req, res);
    }
    res.status(400).json({ error: "Unknown or missing action" });
  } catch (err) {
    console.error(err);
    res.status(200).json({ ok: false, error: err.message });
  }
};
