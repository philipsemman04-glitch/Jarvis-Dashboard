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
 * codebase (in ong-data.js, tasks-data.js, create-task.js, project-data.js,
 * etc.) is actually a data source ID, confirmed against the live schema —
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
  getTitle,
  getRichText,
  getSelect,
  getCheckbox,
  getNumber,
  getDate,
  getRelationIds,
};
