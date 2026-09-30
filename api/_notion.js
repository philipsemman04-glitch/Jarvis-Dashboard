/**
 * Shared Notion API helpers.
 * Uses native fetch (available by default in Vercel's Node.js runtime) —
 * no extra dependencies required.
 *
 * All requests use the token from process.env.NOTION_TOKEN, which is set
 * in Vercel → Settings → Environment Variables. It is NEVER sent to the
 * browser — these functions only ever run server-side inside /api.
 *
 * FIX (Aug 14): migrated from the deprecated /v1/databases/{id}/query
 * endpoint to /v1/data_sources/{id}/query. Notion split "database" and
 * "data source" into two different object types in API version
 * 2025-09-03 — the old endpoint only accepts a database (container) ID,
 * not a data source ID, and returns a plain "could not find database"
 * 404 if you pass the wrong one. Every database ID hardcoded across this
 * codebase (in tasks-data.js, task-api.js, project-data.js, etc.) is
 * actually a data source ID, confirmed against the live schema —
 * so the fix is entirely here, not in any of those files or their IDs.
 */

const NOTION_VERSION = "2025-09-03";
const BASE_URL = "https://api.notion.com/v1";

function headers() {
  if (!process.env.NOTION_TOKEN) {
    throw new Error("NOTION_TOKEN is not set in the environment.");
  }
  return {
    Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
    "Notion-Version": NOTION_VERSION,
    "Content-Type": "application/json",
  };
}

/**
 * Query a data source with an optional filter/sorts body. Handles
 * pagination automatically. The `dataSourceId` param name matches what's
 * actually passed everywhere in this codebase — every DB_* constant in
 * the other /api files is a data source ID, not a database ID.
 */
async function queryDatabase(dataSourceId, body = {}) {
  if (!dataSourceId) return [];
  let results = [];
  let cursor = undefined;
  do {
    const res = await fetch(`${BASE_URL}/data_sources/${dataSourceId}/query`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ ...body, start_cursor: cursor }),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Notion query failed (${res.status}): ${err}`);
    }
    const data = await res.json();
    results = results.concat(data.results);
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);
  return results;
}

/** Create a new page (row) in a data source. */
async function createPage(dataSourceId, properties) {
  const res = await fetch(`${BASE_URL}/pages`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      parent: { type: "data_source_id", data_source_id: dataSourceId },
      properties,
    }),
  });
  if (!res.ok) throw new Error(`Notion create failed (${res.status}): ${await res.text()}`);
  return res.json();
}

/** Update properties on an existing page. Unaffected by the data-source
 *  split — individual page IDs and the /v1/pages endpoint are unchanged. */
async function updatePage(pageId, properties) {
  const res = await fetch(`${BASE_URL}/pages/${pageId}`, {
    method: "PATCH",
    headers: headers(),
    body: JSON.stringify({ properties }),
  });
  if (!res.ok) throw new Error(`Notion update failed (${res.status}): ${await res.text()}`);
  return res.json();
}

/* ---------- Small helpers for writing ---------- */

/**
 * Build a rich_text property value. Notion rejects any single text block
 * longer than 2000 characters, so long content (meeting transcripts,
 * descriptions, notes) is split across several blocks — up to Notion's
 * 100-block limit (~200,000 characters). Reading code already joins all
 * blocks back together.
 */
function richText(value) {
  const chars = Array.from(String(value ?? "")); // code points, so emoji aren't split
  const blocks = [];
  for (let i = 0; i < chars.length && blocks.length < 100; i += 2000) {
    blocks.push({ text: { content: chars.slice(i, i + 2000).join("") } });
  }
  return { rich_text: blocks };
}

/**
 * Today's date (YYYY-MM-DD) in Aurelio's time zone, not the server's UTC —
 * otherwise habits and completions logged in the evening land on the
 * next day. Override with JARVIS_TIMEZONE if he moves.
 */
const TIMEZONE = process.env.JARVIS_TIMEZONE || "America/Mexico_City";
function todayISO() {
  return localDateISO(new Date());
}

// A timestamp's calendar date in Aurelio's time zone (YYYY-MM-DD).
function localDateISO(date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(date));
}

// The day a task was finished (its "Completion Date", set by Jarvis when a
// task becomes "Terminado"). Tasks finished directly in Notion without that
// date return null: they count as finished in "Total" only, never in a
// week or month — a guessed date would put them in the wrong period.
function completedOn(page) {
  const status = page.properties?.Status?.select?.name;
  if (status !== "Terminado") return null;
  return page.properties?.["Completion Date"]?.date?.start?.slice(0, 10) || null;
}

// The day the task was created in Notion, in Aurelio's time zone.
function createdOn(page) {
  return page.created_time ? localDateISO(page.created_time) : null;
}

/* ---------- Writing only fields that really exist ---------- */

// Database schemas, cached briefly per warm instance. Pages were written
// assuming fields ("Collaborators", "Owner", …) that don't all exist in
// Aurelio's databases, and Notion rejects the WHOLE write if even one
// property name is unknown — e.g. a status change failed only because the
// form also sent a missing "Collaborators". Writes are checked against the
// real schema first.
const schemaCache = {};
async function dataSourceSchema(dataSourceId) {
  const cached = schemaCache[dataSourceId];
  if (cached && Date.now() - cached.at < 5 * 60 * 1000) return cached.props;
  const res = await fetch(`${BASE_URL}/data_sources/${dataSourceId}`, { headers: headers() });
  if (!res.ok) throw new Error(`Notion schema fetch failed (${res.status}): ${await res.text()}`);
  const props = (await res.json()).properties || {};
  schemaCache[dataSourceId] = { at: Date.now(), props };
  return props;
}

// The task's responsible person has been called "Collaborators" in some
// pages and "Owner" in others; read/write whichever text field exists.
const PERSON_FIELDS = ["Owner", "Collaborators", "Responsable"];
function personText(props) {
  for (const name of PERSON_FIELDS) {
    const t = props?.[name]?.rich_text;
    if (t && t.length) return t.map((x) => x.plain_text).join("");
  }
  return "";
}

/**
 * Keep only properties that exist in the data source, and put `person`
 * (if given) into its real person field. Returns { properties, skipped }.
 */
async function fitToSchema(dataSourceId, properties, person) {
  const schema = await dataSourceSchema(dataSourceId);
  const fitted = {}, skipped = [];
  for (const [name, value] of Object.entries(properties)) {
    if (schema[name]) fitted[name] = value; else skipped.push(name);
  }
  if (person !== undefined) {
    const field = PERSON_FIELDS.find((name) => schema[name]?.type === "rich_text");
    if (field) fitted[field] = richText(person); else skipped.push("Responsable");
  }
  if (skipped.length) console.warn(`Skipped fields not in data source ${dataSourceId}:`, skipped);
  return { properties: fitted, skipped };
}

/**
 * Make sure a data source has the given properties, adding only the missing
 * ones (never renaming or removing). `wanted` is { name: schemaConfig }, e.g.
 * { Category: { select: {} }, Image: { files: {} } }.
 */
async function ensureProperties(dataSourceId, wanted) {
  const schema = await dataSourceSchema(dataSourceId);
  const missing = Object.fromEntries(Object.entries(wanted).filter(([name]) => !schema[name]));
  if (!Object.keys(missing).length) return schema;
  const res = await fetch(`${BASE_URL}/data_sources/${dataSourceId}`, { method: "PATCH", headers: headers(), body: JSON.stringify({ properties: missing }) });
  if (!res.ok) throw new Error(`Notion field creation failed (${res.status}): ${await res.text()}`);
  delete schemaCache[dataSourceId];
  return dataSourceSchema(dataSourceId);
}

/**
 * Upload a file (base64, optionally as a data: URL) to Notion and return the
 * value for a Files property: [{ type: "file_upload", file_upload: { id }, name }].
 * Vercel caps request bodies at ~4.5 MB, so pages keep files under 3 MB.
 */
async function uploadFile(filename, contentType, dataBase64, maxBytes = 3 * 1024 * 1024) {
  const buffer = Buffer.from(String(dataBase64).replace(/^data:[^;]+;base64,/, ""), "base64");
  if (buffer.length > maxBytes) throw new Error(`El archivo debe pesar menos de ${Math.round(maxBytes / 1024 / 1024)} MB.`);
  const slot = await fetch(`${BASE_URL}/file_uploads`, { method: "POST", headers: headers(), body: JSON.stringify({}) });
  if (!slot.ok) throw new Error(`Upload slot failed (${slot.status}): ${await slot.text()}`);
  const upload = await slot.json();
  const form = new FormData();
  form.append("file", new Blob([buffer], { type: contentType || "application/octet-stream" }), filename || "archivo");
  const sent = await fetch(upload.upload_url, { method: "POST", headers: { Authorization: headers().Authorization, "Notion-Version": headers()["Notion-Version"] }, body: form });
  if (!sent.ok) throw new Error(`Upload failed (${sent.status}): ${await sent.text()}`);
  return [{ type: "file_upload", file_upload: { id: upload.id }, name: filename || "archivo" }];
}

// First file URL of a Files property (uploaded or external).
function getFileUrl(props, key) {
  const f = props?.[key]?.files?.[0];
  return f ? (f.file?.url || f.external?.url || null) : null;
}

/* ---------- Small helpers for reading common Notion property shapes ---------- */

function getTitle(props, key) {
  const t = props[key]?.title;
  return t && t.length ? t.map((x) => x.plain_text).join("") : "";
}
function getRichText(props, key) {
  const t = props[key]?.rich_text;
  return t && t.length ? t.map((x) => x.plain_text).join("") : "";
}
function getSelect(props, key) {
  return props[key]?.select?.name || null;
}
function getCheckbox(props, key) {
  return !!props[key]?.checkbox;
}
function getNumber(props, key) {
  return props[key]?.number ?? null;
}
function getDate(props, key) {
  return props[key]?.date?.start || null;
}
function getRelationIds(props, key) {
  return (props[key]?.relation || []).map((r) => r.id);
}

module.exports = {
  queryDatabase,
  createPage,
  updatePage,
  richText,
  todayISO,
  localDateISO,
  completedOn,
  createdOn,
  fitToSchema,
  ensureProperties,
  uploadFile,
  getFileUrl,
  personText,
  getTitle,
  getRichText,
  getSelect,
  getCheckbox,
  getNumber,
  getDate,
  getRelationIds,
};
