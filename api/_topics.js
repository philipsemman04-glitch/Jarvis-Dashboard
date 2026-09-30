/*
 * Mis Gustos topics — the cover, icon, description and column list of each
 * topic. A topic's name is still a "Tema" option on the Referencias database
 * (that is what references are tagged with); this "Jarvis · Temas" database,
 * created inside the Mis Gustos workspace page on first use, only stores how
 * each topic looks and how its board is organised (set NOTION_DB_TEMAS to
 * use another one).
 */
const { queryDatabase, getTitle, getRichText, getNumber, getFileUrl, richText, uploadFile, findChildDataSource } = require("./_notion");

const NOTION_VERSION = "2025-09-03";
const BASE_URL = "https://api.notion.com/v1";
const DB_WORKSPACES = process.env.NOTION_DB_WORKSPACES || "0c06b31c-8503-4cf6-85cb-65884d7e7a26";
const DB_REFERENCIAS = process.env.NOTION_DB_REFERENCIAS || "7456b43c-50ef-4e15-bea4-ab2f824add71";
const TITLE = "Jarvis · Temas";
const SCHEMA = {
  "Nombre": { title: {} },
  "Descripción": { rich_text: {} },
  "Portada": { files: {} },
  "Ícono": { files: {} },
  "Columnas": { rich_text: {} }, // JSON list of column names, in board order
  "Orden": { number: {} },
};

function headers() {
  return { Authorization: `Bearer ${process.env.NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" };
}
async function notion(path, method = "GET", body) {
  const res = await fetch(`${BASE_URL}${path}`, { method, headers: headers(), body: body ? JSON.stringify(body) : undefined });
  if (!res.ok) throw new Error(`Notion (${res.status}): ${await res.text()}`);
  return res.json();
}
const fail = (message, status = 400) => Object.assign(new Error(message), { status });

let cachedId = process.env.NOTION_DB_TEMAS || null;
// Lives inside the Workspaces row "Mis Gustos & Conocimiento"; found by
// reading that page's children (search can lag behind a new database).
async function topicsSource(create) {
  if (cachedId) return cachedId;
  const rows = await queryDatabase(DB_WORKSPACES, { filter: { property: "Name", title: { contains: "Mis Gustos" } } });
  if (!rows[0]) {
    if (!create) return null;
    throw new Error('No se encontró la página "Mis Gustos & Conocimiento" en Workspaces.');
  }
  const found = await findChildDataSource(rows[0].id, TITLE);
  if (found) return (cachedId = found);
  if (!create) return null;
  const db = await notion("/databases", "POST", {
    parent: { type: "page_id", page_id: rows[0].id },
    title: [{ type: "text", text: { content: TITLE } }],
    is_inline: true,
    initial_data_source: { properties: SCHEMA },
  });
  cachedId = db.data_sources?.[0]?.id;
  if (!cachedId) throw new Error("La base de temas se creó sin fuente de datos.");
  return cachedId;
}

function parseColumns(text) {
  try { const list = JSON.parse(text || "[]"); return Array.isArray(list) ? list.map(String).filter(Boolean) : []; } catch (e) { return []; }
}
function toTopic(p) {
  const props = p.properties;
  return {
    rowId: p.id,
    name: getTitle(props, "Nombre"),
    description: getRichText(props, "Descripción"),
    coverUrl: getFileUrl(props, "Portada"),
    iconUrl: getFileUrl(props, "Ícono"),
    columns: parseColumns(getRichText(props, "Columnas")),
    order: getNumber(props, "Orden"),
  };
}
async function listTopicRows() {
  const id = await topicsSource(false);
  if (!id) return [];
  return (await queryDatabase(id, {})).map(toTopic);
}
async function findRow(name) {
  const rows = await listTopicRows();
  return rows.find((r) => r.name.toLowerCase() === String(name).trim().toLowerCase()) || null;
}

/* ---------- Tema options on Referencias ---------- */
async function temaOptions() {
  const schema = await notion(`/data_sources/${DB_REFERENCIAS}`);
  const prop = schema.properties?.["Tema"];
  if (!prop || prop.type !== "multi_select") throw new Error("La propiedad Tema no existe o no es multi_select.");
  return prop.multi_select.options || [];
}
async function setTemaOptions(options) {
  await notion(`/data_sources/${DB_REFERENCIAS}`, "PATCH", { properties: { "Tema": { multi_select: { options } } } });
}

// Notion's API ignores renaming a select option, so a rename adds the new
// option, moves every reference to it and then removes the old option.
async function renameTema(oldName, newName, options) {
  const old = options.find((o) => o.name.toLowerCase() === oldName.toLowerCase());
  const keep = options.map((o) => ({ id: o.id, name: o.name, color: o.color }));
  await setTemaOptions([...keep, { name: newName, color: old?.color || "default" }]);
  if (!old) return;
  for (const p of await referencesOf(old.name)) {
    const temas = (p.properties["Tema"]?.multi_select || []).map((o) => (o.name === old.name ? newName : o.name));
    await notion(`/pages/${p.id}`, "PATCH", { properties: { "Tema": { multi_select: [...new Set(temas)].map((n) => ({ name: n })) } } });
  }
  const now = await temaOptions();
  await setTemaOptions(now.filter((o) => o.name !== old.name).map((o) => ({ id: o.id, name: o.name, color: o.color })));
}
// References tagged with a topic ([] when the option doesn't exist).
async function referencesOf(topic) {
  if (!(await temaOptions()).some((o) => o.name === topic)) return [];
  return queryDatabase(DB_REFERENCIAS, { filter: { property: "Tema", multi_select: { contains: topic } } });
}

/* ---------- Saving a topic ---------- */
async function topicProperties(b) {
  const props = {};
  if (b.name !== undefined) props["Nombre"] = { title: [{ text: { content: String(b.name).trim() } }] };
  if (b.description !== undefined) props["Descripción"] = richText(b.description || "");
  if (b.columns !== undefined) props["Columnas"] = richText(JSON.stringify((b.columns || []).map(String).filter(Boolean)));
  if (b.order !== undefined) props["Orden"] = { number: b.order === null || b.order === "" ? null : Number(b.order) };
  if (b.coverDataBase64) props["Portada"] = { files: await uploadFile(b.coverFilename || "portada.jpg", b.coverContentType || "image/jpeg", b.coverDataBase64) };
  else if (b.removeCover) props["Portada"] = { files: [] };
  if (b.iconDataBase64) props["Ícono"] = { files: await uploadFile(b.iconFilename || "icono.png", b.iconContentType || "image/png", b.iconDataBase64, 2 * 1024 * 1024) };
  else if (b.removeIcon) props["Ícono"] = { files: [] };
  return props;
}

/**
 * Create or edit a topic. body: { name, oldName?, description?, columns?,
 * order?, cover/icon uploads, removeCover?, removeIcon? }. Creating adds the
 * Tema option; renaming renames the option, so every reference follows.
 */
async function saveTopic(b) {
  const name = String(b.name || "").trim();
  if (!name) throw fail("El nombre del tema es obligatorio.");
  const oldName = String(b.oldName || "").trim();
  const options = await temaOptions();
  const find = (n) => options.find((o) => o.name.toLowerCase() === n.toLowerCase());
  const keep = options.map((o) => ({ id: o.id, name: o.name, color: o.color }));
  if (!oldName) {
    // New topic: its name becomes a new Tema option.
    if (find(name)) throw fail("Ya existe un tema con ese nombre.", 409);
    await setTemaOptions([...keep, { name, color: "default" }]);
  } else if (oldName.toLowerCase() !== name.toLowerCase()) {
    if (find(name)) throw fail("Ya existe un tema con ese nombre.", 409);
    await renameTema(oldName, name, options);
  } else if (!find(name)) {
    await setTemaOptions([...keep, { name, color: "default" }]);
  }

  const id = await topicsSource(true);
  const row = await findRow(oldName || name);
  const properties = await topicProperties({ ...b, name });
  const page = row
    ? await notion(`/pages/${row.rowId}`, "PATCH", { properties })
    : await notion("/pages", "POST", { parent: { type: "data_source_id", data_source_id: id }, properties });
  return toTopic(page);
}

// Deletes a topic: removes the Tema option (Notion takes it off every
// reference; the references themselves stay) and trashes its settings row.
async function deleteTopic(name) {
  if (!String(name || "").trim()) throw fail("name is required");
  const options = await temaOptions();
  const target = options.find((o) => o.name.toLowerCase() === String(name).trim().toLowerCase());
  if (target) await setTemaOptions(options.filter((o) => o !== target).map((o) => ({ id: o.id, name: o.name, color: o.color })));
  const row = await findRow(name);
  if (row) await notion(`/pages/${row.rowId}`, "PATCH", { in_trash: true });
  if (!target && !row) throw fail(`No se encontró el tema "${name}".`, 404);
}

/* ---------- Columns of a topic board ---------- */
async function referencesInColumn(topic, column) {
  const pages = await referencesOf(topic);
  return pages.filter((p) => (getRichText(p.properties, "Columna") || "").trim() === column);
}

/**
 * body: { topic, op: "add" | "rename" | "delete" | "order", column?, newName?, columns? }
 * Renaming moves the topic's references to the new name; deleting moves them
 * to "Sin columna" (they are never deleted with the column).
 */
async function saveColumns(b) {
  const topic = String(b.topic || "").trim();
  if (!topic) throw fail("topic is required");
  const row = await findRow(topic);
  let columns = row ? [...row.columns] : [];
  const column = String(b.column || "").trim(), newName = String(b.newName || "").trim();
  if (b.op === "add") {
    if (!column) throw fail("El nombre de la columna es obligatorio.");
    if (!columns.includes(column)) columns.push(column);
  } else if (b.op === "rename") {
    if (!column || !newName) throw fail("column and newName are required");
    for (const p of await referencesInColumn(topic, column)) await notion(`/pages/${p.id}`, "PATCH", { properties: { "Columna": richText(newName) } });
    columns = columns.includes(column) ? columns.map((c) => (c === column ? newName : c)) : [...columns, newName];
    columns = [...new Set(columns)];
  } else if (b.op === "delete") {
    if (!column) throw fail("column is required");
    for (const p of await referencesInColumn(topic, column)) await notion(`/pages/${p.id}`, "PATCH", { properties: { "Columna": richText("") } });
    columns = columns.filter((c) => c !== column);
  } else if (b.op === "order") {
    columns = (b.columns || []).map(String).filter(Boolean);
  } else throw fail("op no válida");
  const saved = await saveTopic({ name: topic, oldName: topic, columns });
  return saved.columns;
}

module.exports = { listTopicRows, saveTopic, deleteTopic, saveColumns };
