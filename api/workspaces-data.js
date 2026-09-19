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

const NOTION_VERSION = "2025-09-03";
const NOTION_TOKEN = process.env.NOTION_TOKEN;
function notionHeaders() {
  return { Authorization: `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" };
}
function richText(value) { return { rich_text: [{ text: { content: String(value || "") } }] }; }

async function uploadWorkspaceIcon(pageId, filename, contentType, dataBase64, schemaProps) {
  const buffer = Buffer.from(String(dataBase64).replace(/^data:[^;]+;base64,/, ""), "base64");
  if (buffer.length > 2 * 1024 * 1024) throw new Error("El icono debe pesar menos de 2MB.");
  const createRes = await fetch("https://api.notion.com/v1/file_uploads", { method: "POST", headers: notionHeaders(), body: JSON.stringify({}) });
  if (!createRes.ok) throw new Error(`Icon upload slot failed (${createRes.status}): ${await createRes.text()}`);
  const upload = await createRes.json();
  const form = new FormData();
  form.append("file", new Blob([buffer], { type: contentType || "image/png" }), filename || "jarvis-icon.png");
  const sendRes = await fetch(upload.upload_url, { method: "POST", headers: { Authorization: `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION }, body: form });
  if (!sendRes.ok) throw new Error(`Icon upload failed (${sendRes.status}): ${await sendRes.text()}`);

  if (!schemaProps["Icon Image"]) {
    const schemaUpdate = await fetch(`https://api.notion.com/v1/data_sources/${DB_WORKSPACES}`, { method: "PATCH", headers: notionHeaders(), body: JSON.stringify({ properties: { "Icon Image": { files: {} } } }) });
    if (!schemaUpdate.ok) throw new Error(`Icon field creation failed (${schemaUpdate.status}): ${await schemaUpdate.text()}`);
  }
  const pageRes = await fetch(`https://api.notion.com/v1/pages/${pageId}`, { headers: notionHeaders() });
  if (!pageRes.ok) throw new Error(`Workspace fetch failed (${pageRes.status}): ${await pageRes.text()}`);
  const page = await pageRes.json();
  const result = await fetch(`https://api.notion.com/v1/pages/${pageId}`, { method: "PATCH", headers: notionHeaders(), body: JSON.stringify({ properties: { "Icon Image": { files: [{ type: "file_upload", file_upload: { id: upload.id }, name: filename || "jarvis-icon.png" }] } } }) });
  if (!result.ok) throw new Error(`Icon save failed (${result.status}): ${await result.text()}`);
}

async function uploadWorkspaceCover(pageId, filename, contentType, dataBase64, schemaProps) {
  const buffer = Buffer.from(String(dataBase64).replace(/^data:[^;]+;base64,/, ""), "base64");
  if (buffer.length > 3 * 1024 * 1024) throw new Error("La portada debe pesar menos de 3MB.");
  const createRes = await fetch("https://api.notion.com/v1/file_uploads", { method: "POST", headers: notionHeaders(), body: JSON.stringify({}) });
  if (!createRes.ok) throw new Error(`Cover upload slot failed (${createRes.status}): ${await createRes.text()}`);
  const upload = await createRes.json();
  const form = new FormData();
  form.append("file", new Blob([buffer], { type: contentType || "image/jpeg" }), filename || "jarvis-cover.jpg");
  const sendRes = await fetch(upload.upload_url, { method: "POST", headers: { Authorization: `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION }, body: form });
  if (!sendRes.ok) throw new Error(`Cover upload failed (${sendRes.status}): ${await sendRes.text()}`);
  if (!schemaProps["Cover Image"]) {
    const schemaUpdate = await fetch(`https://api.notion.com/v1/data_sources/${DB_WORKSPACES}`, { method: "PATCH", headers: notionHeaders(), body: JSON.stringify({ properties: { "Cover Image": { files: {} } } }) });
    if (!schemaUpdate.ok) throw new Error(`Cover field creation failed (${schemaUpdate.status}): ${await schemaUpdate.text()}`);
  }
  const pageRes = await fetch(`https://api.notion.com/v1/pages/${pageId}`, { headers: notionHeaders() });
  if (!pageRes.ok) throw new Error(`Workspace fetch failed (${pageRes.status}): ${await pageRes.text()}`);
  const page = await pageRes.json();
  const result = await fetch(`https://api.notion.com/v1/pages/${pageId}`, { method: "PATCH", headers: notionHeaders(), body: JSON.stringify({ properties: { "Cover Image": { files: [{ type: "file_upload", file_upload: { id: upload.id }, name: filename || "jarvis-cover.jpg" }] } } }) });
  if (!result.ok) throw new Error(`Cover save failed (${result.status}): ${await result.text()}`);
}

async function uploadAppLogo(pageId, filename, contentType, dataBase64, schemaProps) {
  const buffer = Buffer.from(String(dataBase64).replace(/^data:[^;]+;base64,/, ""), "base64");
  if (buffer.length > 2 * 1024 * 1024) throw new Error("El logo de Jarvis debe pesar menos de 2MB.");
  const createRes = await fetch("https://api.notion.com/v1/file_uploads", { method: "POST", headers: notionHeaders(), body: JSON.stringify({}) });
  if (!createRes.ok) throw new Error(`App logo upload slot failed (${createRes.status}): ${await createRes.text()}`);
  const upload = await createRes.json();
  const form = new FormData();
  form.append("file", new Blob([buffer], { type: contentType || "image/png" }), filename || "jarvis-logo.png");
  const sendRes = await fetch(upload.upload_url, { method: "POST", headers: { Authorization: `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION }, body: form });
  if (!sendRes.ok) throw new Error(`App logo upload failed (${sendRes.status}): ${await sendRes.text()}`);
  if (!schemaProps["App Logo"]) {
    const schemaUpdate = await fetch(`https://api.notion.com/v1/data_sources/${DB_WORKSPACES}`, { method: "PATCH", headers: notionHeaders(), body: JSON.stringify({ properties: { "App Logo": { files: {} } } }) });
    if (!schemaUpdate.ok) throw new Error(`App logo field creation failed (${schemaUpdate.status}): ${await schemaUpdate.text()}`);
  }
  const pageRes = await fetch(`https://api.notion.com/v1/pages/${pageId}`, { headers: notionHeaders() });
  if (!pageRes.ok) throw new Error(`Workspace fetch failed (${pageRes.status}): ${await pageRes.text()}`);
  const page = await pageRes.json();
  const result = await fetch(`https://api.notion.com/v1/pages/${pageId}`, { method: "PATCH", headers: notionHeaders(), body: JSON.stringify({ properties: { "App Logo": { files: [{ type: "file_upload", file_upload: { id: upload.id }, name: filename || "jarvis-logo.png" }] } } }) });
  if (!result.ok) throw new Error(`App logo save failed (${result.status}): ${await result.text()}`);
}

async function updateWorkspace(req, res) {
  const { workspaceId, name, icon, iconFilename, iconContentType, iconDataBase64, coverFilename, coverContentType, coverDataBase64, description, route, accentColor, status, statLabel, coverUrl } = req.body || {};
  if (!workspaceId) { res.status(400).json({ error: "workspaceId is required" }); return; }
  const schemaRes = await fetch(`https://api.notion.com/v1/data_sources/${DB_WORKSPACES}`, { headers: notionHeaders() });
  if (!schemaRes.ok) throw new Error(`Workspace schema failed (${schemaRes.status}): ${await schemaRes.text()}`);
  const schema = await schemaRes.json();
  const schemaProps = schema.properties || {};
  if (iconDataBase64) await uploadWorkspaceIcon(workspaceId, iconFilename, iconContentType, iconDataBase64, schemaProps);
  if (coverDataBase64) await uploadWorkspaceCover(workspaceId, coverFilename, coverContentType, coverDataBase64, schemaProps);
  if ((name !== undefined && !schemaProps["Display Name"]) || (icon !== undefined && !iconDataBase64 && !schemaProps["Display Icon"])) {
    const additions = {};
    if (name !== undefined && !schemaProps["Display Name"]) additions["Display Name"] = { rich_text: {} };
    if (icon !== undefined && !iconDataBase64 && !schemaProps["Display Icon"]) additions["Display Icon"] = { rich_text: {} };
    const updateSchemaRes = await fetch(`https://api.notion.com/v1/data_sources/${DB_WORKSPACES}`, {
      method: "PATCH", headers: notionHeaders(), body: JSON.stringify({ properties: additions }),
    });
    if (!updateSchemaRes.ok) throw new Error(`Workspace schema update failed (${updateSchemaRes.status}): ${await updateSchemaRes.text()}`);
    Object.assign(schemaProps, additions);
  }
  const properties = {};
  const put = (name, value, type) => {
    if (value === undefined || !schemaProps[name]) return;
    if (type === "rich_text") properties[name] = richText(value);
    if (type === "url") properties[name] = { url: value || null };
    if (type === "select") properties[name] = value ? { select: { name: value } } : { select: null };
  };
  put("Display Name", name, "rich_text");
  if (!iconDataBase64) {
    put("Display Icon", icon, "rich_text");
    if (!schemaProps["Display Icon"]) put("Icon", icon, "rich_text");
  }
  put("Description", description, "rich_text");
  put("Route", route, "url");
  put("Accent Color", accentColor, "select");
  put("Status", status, "select");
  put("Stat Label", statLabel, "rich_text");
  put("Cover URL", coverUrl, "url");
  put("Cover", coverUrl, "url");
  if (!Object.keys(properties).length) { res.status(400).json({ error: "No editable branding properties were found in the Workspaces schema." }); return; }
  const pageRes = await fetch(`https://api.notion.com/v1/pages/${workspaceId}`, { method: "PATCH", headers: notionHeaders(), body: JSON.stringify({ properties }) });
  if (!pageRes.ok) throw new Error(`Workspace update failed (${pageRes.status}): ${await pageRes.text()}`);
  res.status(200).json({ ok: true, workspaceId });
}

module.exports = async (req, res) => {
  if (req.method === "POST") {
    try {
      if (req.body?.action === "global-logo") {
        const schemaRes = await fetch(`https://api.notion.com/v1/data_sources/${DB_WORKSPACES}`, { headers: notionHeaders() });
        const schema = await schemaRes.json();
        const first = (await queryDatabase(DB_WORKSPACES, { page_size: 1 }))[0];
        if (!first) throw new Error("No workspace page exists to store the Jarvis logo.");
        await uploadAppLogo(first.id, req.body.filename, req.body.contentType, req.body.dataBase64, schema.properties || {});
        return res.status(200).json({ ok: true });
      }
      return await updateWorkspace(req, res);
    }
    catch (err) { console.error(err); res.status(200).json({ ok: false, error: err.message }); return; }
  }
  try {
    const [wsPages, actionPages, cardPages, docPages, refPages] = await Promise.all([
      queryDatabase(DB_WORKSPACES, { sorts: [{ property: "Order", direction: "ascending" }] }),
      queryDatabase(DB_ACTIONS, {}),
      queryDatabase(DB_ROUTEPUP_CARDS, {}).catch(() => []),
      queryDatabase(DB_ARISTOTELES_DOCS, {}).catch(() => []),
      queryDatabase(DB_REFERENCIAS, {}).catch(() => []),
    ]);

    // Task counts per project are computed from the complete Master Actions
    // dataset. Home uses these fields directly instead of displaying a
    // manually typed or inferred number.
    const totalTasksByProject = {};
    const activeTasksByProject = {};
    actionPages.forEach((p) => {
      const project = getSelect(p.properties, "Project");
      const status = getSelect(p.properties, "Status");
      if (project) totalTasksByProject[project] = (totalTasksByProject[project] || 0) + 1;
      if (project && OPEN_STATUSES.has(status)) {
        activeTasksByProject[project] = (activeTasksByProject[project] || 0) + 1;
      }
    });
    const totalActiveTasks = Object.values(activeTasksByProject).reduce((a, b) => a + b, 0);
    const totalAllTasks = actionPages.length;
    const knownTaskWorkspaces = new Set(["One Night Guest", "RoutePup", "StatStrike", "Nikita", "Personal OS", "Tareas & Proyectos"]);

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

    const appLogoPage = wsPages.find((p) => p.properties["App Logo"]?.files?.length);
    const appLogoUrl = appLogoPage?.properties["App Logo"]?.files?.[0]?.file?.url || appLogoPage?.properties["App Logo"]?.files?.[0]?.external?.url || null;
    const workspaces = wsPages.map((p) => {
      const props = p.properties;
      const name = getTitle(props, "Name");
      const computed = computedStat(name);
      return {
        id: p.id,
        notionUrl: p.url,
        name,
        canonicalName: name,
        displayName: getRichText(props, "Display Name") || name,
        icon: props["Icon Image"]?.files?.[0]?.file?.url || props["Icon Image"]?.files?.[0]?.external?.url || getRichText(props, "Display Icon") || getRichText(props, "Icon") || "📁",
        description: getRichText(props, "Description"),
        statLabel: computed ?? (getRichText(props, "Stat Label") || null), // null → front-end shows "No data yet"
        taskCounts: name === "Tareas & Proyectos"
          ? { total: totalAllTasks, active: totalActiveTasks, inactive: totalAllTasks - totalActiveTasks }
          : knownTaskWorkspaces.has(name)
            ? { total: totalTasksByProject[name] || 0, active: activeTasksByProject[name] || 0, inactive: (totalTasksByProject[name] || 0) - (activeTasksByProject[name] || 0) }
            : null,
        statTrend: getRichText(props, "Stat Trend") || null,
        route: props["Route"]?.url || null,
        accentColor: getSelect(props, "Accent Color") || "Gray",
        type: getSelect(props, "Type") || "Business",
        status: getSelect(props, "Status") || "Coming soon",
        coverUrl: props["Cover Image"]?.files?.[0]?.file?.url || props["Cover Image"]?.files?.[0]?.external?.url || props["Cover URL"]?.url || props["Cover"]?.url || null,
        order: getNumber(props, "Order") ?? 999,
      };
    });

    res.status(200).json({
      source: "notion-live",
      fetchedAt: new Date().toISOString(),
      workspaces,
      appLogoUrl,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
