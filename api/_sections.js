/*
 * Aristóteles sections and documents.
 *
 * A section's name is a "Sección" option on "Aristóteles — Documentos"
 * (that is what documents are tagged with). How each section looks — its
 * description, icon, cover and position — is kept in "Jarvis · Secciones",
 * a small database created inside the Workspaces row "Aristóteles" the first
 * time a section is edited (set NOTION_DB_SECCIONES to use another one).
 * That first edit copies the current list into it, so from then on it is the
 * list of sections; a Sección option added directly in Notion still appears.
 */
const { queryDatabase, getTitle, getRichText, getNumber, getFileUrl, richText, uploadFile, findChildDataSource } = require("./_notion");

const NOTION_VERSION = "2025-09-03";
const BASE_URL = "https://api.notion.com/v1";
const DB_WORKSPACES = process.env.NOTION_DB_WORKSPACES || "0c06b31c-8503-4cf6-85cb-65884d7e7a26";
const DB_DOCS = process.env.NOTION_DB_ARISTOTELES_DOCS || "650f515d-4540-4a67-9066-f04b0944e394";
const TITLE = "Jarvis · Secciones";
const SCHEMA = {
  "Nombre": { title: {} },
  "Descripción": { rich_text: {} },
  "Ícono": { rich_text: {} },
  "Portada": { files: {} },
  "Orden": { number: {} },
};
const ESTADOS = ["Vacío", "Borrador", "Escrito"];

// Aurelio's 15 sections, in his order, with his descriptions.
const STANDARD = [
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

function headers() {
  return { Authorization: `Bearer ${process.env.NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" };
}
async function notion(path, method = "GET", body) {
  const res = await fetch(`${BASE_URL}${path}`, { method, headers: headers(), body: body ? JSON.stringify(body) : undefined });
  if (!res.ok) throw new Error(`Notion (${res.status}): ${await res.text()}`);
  return res.json();
}
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const same = (a, b) => String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();

/* ---------- the settings database ---------- */
let cachedId = process.env.NOTION_DB_SECCIONES || null;
async function sectionsSource(create) {
  if (cachedId) return cachedId;
  const rows = await queryDatabase(DB_WORKSPACES, { filter: { property: "Name", title: { contains: "Arist" } } });
  if (!rows[0]) {
    if (!create) return null;
    throw new Error('No se encontró la página "Aristóteles" en Workspaces.');
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
  if (!cachedId) throw new Error("La base de secciones se creó sin fuente de datos.");
  return cachedId;
}
function toRow(p) {
  const props = p.properties;
  return {
    rowId: p.id,
    name: getTitle(props, "Nombre"),
    desc: getRichText(props, "Descripción"),
    icon: getRichText(props, "Ícono") || "📁",
    coverUrl: getFileUrl(props, "Portada"),
    order: getNumber(props, "Orden"),
  };
}
async function listRows() {
  const id = await sectionsSource(false);
  if (!id) return [];
  return (await queryDatabase(id, {})).map(toRow).filter((r) => r.name)
    .sort((a, b) => (a.order ?? 1e9) - (b.order ?? 1e9) || a.name.localeCompare(b.name));
}

/* ---------- Sección options on the documents database ---------- */
async function sectionOptions() {
  const schema = await notion(`/data_sources/${DB_DOCS}`);
  const prop = schema.properties?.["Sección"];
  if (!prop || prop.type !== "select") throw new Error("La propiedad Sección no existe o no es select.");
  return prop.select.options || [];
}
async function setSectionOptions(options) {
  await notion(`/data_sources/${DB_DOCS}`, "PATCH", { properties: { "Sección": { select: { options: options.map((o) => (o.id ? { id: o.id, name: o.name, color: o.color } : o)) } } } });
}
async function docsIn(name) {
  if (!(await sectionOptions()).some((o) => o.name === name)) return [];
  return queryDatabase(DB_DOCS, { filter: { property: "Sección", select: { equals: name } } });
}

/**
 * The list shown on the page: the settings rows in their order, then any
 * section that only exists in Notion (an option or a document's value).
 * Before the settings database exists it is the 15 standard sections plus
 * those extras — what the page always showed.
 */
function mergeSections(rows, optionNames, docSections) {
  const base = rows.length ? rows.map((r) => ({ name: r.name, icon: r.icon, desc: r.desc, coverUrl: r.coverUrl })) : STANDARD.map((s) => ({ ...s, coverUrl: null }));
  const known = new Set(base.map((s) => s.name));
  const extra = [...optionNames, ...docSections].filter((n, i, all) => n && !known.has(n) && all.indexOf(n) === i);
  return [...base, ...extra.map((name) => ({ name, icon: "📁", desc: "", coverUrl: null }))];
}
async function listSections(docSections, optionNames) {
  return mergeSections(await listRows().catch(() => []), optionNames || [], docSections || []);
}

// First write: copy the current list into the settings database, in order.
async function ensureSeeded() {
  const id = await sectionsSource(true);
  let rows = await listRows();
  if (rows.length) return { id, rows };
  const options = (await sectionOptions()).map((o) => o.name);
  const list = mergeSections([], options, []);
  for (let i = 0; i < list.length; i++) {
    const s = list[i];
    await notion("/pages", "POST", { parent: { type: "data_source_id", data_source_id: id }, properties: {
      "Nombre": { title: [{ text: { content: s.name } }] }, "Descripción": richText(s.desc || ""), "Ícono": richText(s.icon || "📁"), "Orden": { number: i + 1 },
    } });
  }
  rows = await listRows();
  return { id, rows };
}

async function rowProperties(b) {
  const props = {};
  if (b.name !== undefined) props["Nombre"] = { title: [{ text: { content: String(b.name).trim() } }] };
  if (b.description !== undefined) props["Descripción"] = richText(b.description || "");
  if (b.icon !== undefined) props["Ícono"] = richText(String(b.icon || "").trim() || "📁");
  if (b.order !== undefined) props["Orden"] = { number: b.order === null ? null : Number(b.order) };
  if (b.coverDataBase64) props["Portada"] = { files: await uploadFile(b.coverFilename || "portada.jpg", b.coverContentType || "image/jpeg", b.coverDataBase64) };
  else if (b.removeCover) props["Portada"] = { files: [] };
  return props;
}

/**
 * Create or edit a section. body: { name, oldName?, description?, icon?,
 * cover upload, removeCover? }. Creating adds the Sección option; renaming
 * renames it, so every document follows.
 */
async function saveSection(b) {
  const name = String(b.name || "").trim();
  if (!name) throw fail("El nombre de la sección es obligatorio.");
  const oldName = String(b.oldName || "").trim();
  const { id, rows } = await ensureSeeded();
  const options = await sectionOptions();
  const exists = (n) => options.some((o) => same(o.name, n)) || rows.some((r) => same(r.name, n));
  if (!oldName || !same(oldName, name)) { if (exists(name)) throw fail("Ya existe una sección con ese nombre.", 409); }

  if (!oldName) {
    await setSectionOptions([...options, { name, color: "default" }]);
  } else if (!same(oldName, name)) {
    // Notion's API ignores renaming an option: add the new one, move the
    // documents, then remove the old one.
    const old = options.find((o) => same(o.name, oldName));
    await setSectionOptions([...options, { name, color: old?.color || "default" }]);
    if (old) {
      for (const p of await docsIn(old.name)) await notion(`/pages/${p.id}`, "PATCH", { properties: { "Sección": { select: { name } } } });
      await setSectionOptions((await sectionOptions()).filter((o) => o.name !== old.name));
    }
  } else if (!options.some((o) => same(o.name, name))) {
    await setSectionOptions([...options, { name, color: "default" }]);
  }

  const row = rows.find((r) => same(r.name, oldName || name));
  const order = row ? undefined : Math.max(0, ...rows.map((r) => r.order || 0)) + 1;
  const properties = await rowProperties({ ...b, name, order });
  const page = row
    ? await notion(`/pages/${row.rowId}`, "PATCH", { properties })
    : await notion("/pages", "POST", { parent: { type: "data_source_id", data_source_id: id }, properties });
  return toRow(page);
}

/**
 * Deletes a section. Its documents are never deleted: when it has any,
 * body.moveTo names the section they move to (required).
 */
async function deleteSection(b) {
  const name = String(b.name || "").trim();
  if (!name) throw fail("name is required");
  const { rows } = await ensureSeeded();
  const docs = await docsIn(name);
  const moveTo = String(b.moveTo || "").trim();
  if (docs.length && !moveTo) throw fail(`La sección tiene ${docs.length} documento${docs.length === 1 ? "" : "s"}: elige a qué sección moverlos.`, 409);
  if (moveTo && same(moveTo, name)) throw fail("Elige otra sección para los documentos.");
  for (const p of docs) await notion(`/pages/${p.id}`, "PATCH", { properties: { "Sección": { select: { name: moveTo } } } });
  const options = await sectionOptions();
  if (options.some((o) => o.name === name)) await setSectionOptions(options.filter((o) => o.name !== name));
  const row = rows.find((r) => same(r.name, name));
  if (row) await notion(`/pages/${row.rowId}`, "PATCH", { in_trash: true });
  return { moved: docs.length };
}

// A new section with the same description and icon, placed right after the
// original (its documents stay where they are).
async function duplicateSection(b) {
  const { rows } = await ensureSeeded();
  const src = rows.find((r) => same(r.name, b.name));
  if (!src) throw fail(`No se encontró la sección "${b.name}".`, 404);
  const options = await sectionOptions();
  let name = `${src.name} (copia)`, n = 2;
  while (options.some((o) => same(o.name, name)) || rows.some((r) => same(r.name, name))) name = `${src.name} (copia ${n++})`;
  const saved = await saveSection({ name, description: src.desc, icon: src.icon });
  // Shift everything after the original down one place.
  const after = rows.filter((r) => (r.order || 0) > (src.order || 0));
  for (const r of after) await notion(`/pages/${r.rowId}`, "PATCH", { properties: { "Orden": { number: (r.order || 0) + 1 } } });
  await notion(`/pages/${saved.rowId}`, "PATCH", { properties: { "Orden": { number: (src.order || 0) + 1 } } });
  return { ...saved, order: (src.order || 0) + 1 };
}

// Moves a section one place earlier (dir -1) or later (dir 1).
async function moveSection(b) {
  const { rows } = await ensureSeeded();
  const i = rows.findIndex((r) => same(r.name, b.name));
  if (i < 0) throw fail(`No se encontró la sección "${b.name}".`, 404);
  const j = i + (Number(b.dir) < 0 ? -1 : 1);
  if (j < 0 || j >= rows.length) return rows.map((r) => r.name);
  const list = [...rows];
  [list[i], list[j]] = [list[j], list[i]];
  // Rewrite positions 1..n only where they changed.
  for (let k = 0; k < list.length; k++) if (list[k].order !== k + 1) await notion(`/pages/${list[k].rowId}`, "PATCH", { properties: { "Orden": { number: k + 1 } } });
  return list.map((r) => r.name);
}

/* ---------- documents ---------- */
function paragraphs(text) {
  const parts = String(text || "").replace(/\r\n/g, "\n").split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const blocks = [];
  for (const p of parts) for (let i = 0; i < p.length && blocks.length < 100; i += 1900)
    blocks.push({ object: "block", type: "paragraph", paragraph: { rich_text: [{ type: "text", text: { content: p.slice(i, i + 1900) } }] } });
  return blocks;
}
function toDoc(p) {
  const props = p.properties;
  return { id: p.id, notionUrl: p.url, name: getTitle(props, "Documento"), seccion: props["Sección"]?.select?.name || null, estado: props["Estado"]?.select?.name || null, notas: getRichText(props, "Notas"), lastEditedTime: p.last_edited_time, createdTime: p.created_time };
}

/** body: { documento, seccion, contenido?, estado?, notas? } — contenido becomes the page text. */
async function createDoc(b) {
  const documento = String(b.documento || "").trim();
  if (!documento) throw fail("El título del documento es obligatorio.");
  const seccion = String(b.seccion || "").trim();
  if (!seccion) throw fail("Elige una sección.");
  const options = await sectionOptions();
  if (!options.some((o) => o.name === seccion)) await setSectionOptions([...options, { name: seccion, color: "default" }]);
  const blocks = paragraphs(b.contenido);
  const estado = ESTADOS.includes(b.estado) ? b.estado : blocks.length ? "Escrito" : "Vacío";
  const properties = { "Documento": { title: [{ text: { content: documento } }] }, "Sección": { select: { name: seccion } }, "Estado": { select: { name: estado } } };
  if (b.notas) properties["Notas"] = richText(b.notas);
  const page = await notion("/pages", "POST", { parent: { type: "data_source_id", data_source_id: DB_DOCS }, properties, children: blocks });
  return toDoc(page);
}

/** body: { pageId, documento?, seccion?, estado?, notas? } */
async function updateDoc(b) {
  if (!b.pageId) throw fail("pageId is required");
  const properties = {};
  if (b.documento !== undefined) { if (!String(b.documento).trim()) throw fail("El título del documento es obligatorio."); properties["Documento"] = { title: [{ text: { content: String(b.documento).trim() } }] }; }
  if (b.seccion !== undefined) properties["Sección"] = b.seccion ? { select: { name: String(b.seccion) } } : { select: null };
  if (b.estado !== undefined) { if (!ESTADOS.includes(b.estado)) throw fail("Estado no válido."); properties["Estado"] = { select: { name: b.estado } }; }
  if (b.notas !== undefined) properties["Notas"] = richText(b.notas || "");
  return toDoc(await notion(`/pages/${b.pageId}`, "PATCH", { properties }));
}

async function deleteDoc(pageId) {
  if (!pageId) throw fail("pageId is required");
  await notion(`/pages/${pageId}`, "PATCH", { in_trash: true });
}

module.exports = { STANDARD, listSections, sectionOptions, saveSection, deleteSection, duplicateSection, moveSection, createDoc, updateDoc, deleteDoc };
