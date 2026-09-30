/*
 * Jarvis calendar items — events, appointments, reminders and notes that are
 * not tasks or meetings. They live in their own Notion database,
 * "Jarvis · Calendario", created inside the Calendario workspace page the
 * first time something is saved (set NOTION_DB_CALENDAR to use another one).
 *
 * Tasks (Master Actions) and meetings (Meetings) keep living in their own
 * databases; the calendar shows all three together.
 */
const { queryDatabase, getTitle, getRichText, getSelect, getCheckbox, getNumber, richText, uploadFile } = require("./_notion");

const NOTION_VERSION = "2025-09-03";
const BASE_URL = "https://api.notion.com/v1";
const DB_WORKSPACES = process.env.NOTION_DB_WORKSPACES || "0c06b31c-8503-4cf6-85cb-65884d7e7a26";
const TIMEZONE = process.env.JARVIS_TIMEZONE || "America/Mexico_City";
const TITLE = "Jarvis · Calendario";

// Kind (as the pages send it) ↔ the "Tipo" option stored in Notion.
const KINDS = { event: "Evento", appointment: "Cita", reminder: "Recordatorio", note: "Nota" };
const KIND_OF = Object.fromEntries(Object.entries(KINDS).map(([k, v]) => [v, k]));

const SCHEMA = {
  "Título": { title: {} },
  "Tipo": { select: { options: Object.values(KINDS).map((name) => ({ name })) } },
  "Fecha": { date: {} },
  "Proyecto": { select: {} },
  "Notas": { rich_text: {} },
  "Lugar": { rich_text: {} },
  "Enlace": { url: {} },
  "Aviso (min)": { number: {} },
  "Hecho": { checkbox: {} },
  "Archivos": { files: {} },
};

function headers() {
  return { Authorization: `Bearer ${process.env.NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" };
}

let cachedId = process.env.NOTION_DB_CALENDAR || null;

// The calendar data source id; with create=true it is created if missing.
async function calendarSource(create) {
  if (cachedId) return cachedId;
  const found = await fetch(`${BASE_URL}/search`, {
    method: "POST", headers: headers(),
    body: JSON.stringify({ query: TITLE, filter: { property: "object", value: "data_source" } }),
  });
  if (found.ok) {
    const hit = ((await found.json()).results || []).find((r) => (r.title || []).map((t) => t.plain_text).join("") === TITLE);
    if (hit) return (cachedId = hit.id);
  }
  if (!create) return null;

  const rows = await queryDatabase(DB_WORKSPACES, { filter: { property: "Name", title: { equals: "Calendario" } } });
  const parent = rows[0]?.id;
  if (!parent) throw new Error('No se encontró la página "Calendario" en Workspaces para crear la base del calendario.');
  const res = await fetch(`${BASE_URL}/databases`, {
    method: "POST", headers: headers(),
    body: JSON.stringify({
      parent: { type: "page_id", page_id: parent },
      title: [{ type: "text", text: { content: TITLE } }],
      is_inline: true,
      initial_data_source: { properties: SCHEMA },
    }),
  });
  if (!res.ok) throw new Error(`No se pudo crear la base del calendario (${res.status}): ${await res.text()}`);
  const db = await res.json();
  cachedId = db.data_sources?.[0]?.id;
  if (!cachedId) throw new Error("La base del calendario se creó sin fuente de datos.");
  return cachedId;
}

// "2026-09-30" + "10:00" → Notion date in Aurelio's time zone.
function dateValue(date, time, endTime) {
  if (!date) return { date: null };
  if (!time) return { date: { start: date } };
  return { date: { start: `${date}T${time}:00`, end: endTime ? `${date}T${endTime}:00` : null, time_zone: TIMEZONE } };
}
// Notion returns local ISO strings for dates saved with a time zone, so the
// date and time parts can be read directly.
function splitDate(d) {
  const start = d?.start || "", end = d?.end || "";
  return { date: start.slice(0, 10) || null, time: start.length > 10 ? start.slice(11, 16) : null, endTime: end.length > 10 ? end.slice(11, 16) : null };
}

function toItem(p) {
  const props = p.properties;
  const when = splitDate(props["Fecha"]?.date);
  return {
    id: p.id, url: p.url, source: "calendar",
    kind: KIND_OF[getSelect(props, "Tipo")] || "event",
    title: getTitle(props, "Título"),
    ...when,
    project: getSelect(props, "Proyecto"),
    notes: getRichText(props, "Notas"),
    place: getRichText(props, "Lugar"),
    link: props["Enlace"]?.url || null,
    remindMinutes: getNumber(props, "Aviso (min)"),
    done: getCheckbox(props, "Hecho"),
    files: (props["Archivos"]?.files || []).map((f) => ({ name: f.name, url: f.file?.url || f.external?.url || null })),
  };
}

async function listItems() {
  const id = await calendarSource(false);
  if (!id) return [];
  return (await queryDatabase(id, {})).map(toItem);
}

function itemProperties(b) {
  const props = {};
  if (b.title !== undefined) {
    if (!String(b.title || "").trim()) throw Object.assign(new Error("El título es obligatorio."), { status: 400 });
    props["Título"] = { title: [{ text: { content: String(b.title).trim() } }] };
  }
  if (b.kind !== undefined) {
    if (!KINDS[b.kind]) throw Object.assign(new Error("Tipo no válido."), { status: 400 });
    props["Tipo"] = { select: { name: KINDS[b.kind] } };
  }
  if (b.date !== undefined) props["Fecha"] = dateValue(b.date, b.time, b.endTime);
  if (b.project !== undefined) props["Proyecto"] = b.project ? { select: { name: b.project } } : { select: null };
  if (b.notes !== undefined) props["Notas"] = richText(b.notes || "");
  if (b.place !== undefined) props["Lugar"] = richText(b.place || "");
  if (b.link !== undefined) props["Enlace"] = { url: b.link || null };
  if (b.remindMinutes !== undefined) props["Aviso (min)"] = { number: b.remindMinutes === "" || b.remindMinutes === null ? null : Number(b.remindMinutes) };
  if (b.done !== undefined) props["Hecho"] = { checkbox: !!b.done };
  return props;
}

async function saveItem(b) {
  const id = await calendarSource(true);
  const properties = itemProperties(b);
  const res = b.pageId
    ? await fetch(`${BASE_URL}/pages/${b.pageId}`, { method: "PATCH", headers: headers(), body: JSON.stringify({ properties }) })
    : await fetch(`${BASE_URL}/pages`, { method: "POST", headers: headers(), body: JSON.stringify({ parent: { type: "data_source_id", data_source_id: id }, properties }) });
  if (!res.ok) throw new Error(`Notion (${res.status}): ${await res.text()}`);
  return toItem(await res.json());
}

async function deleteItem(pageId) {
  const res = await fetch(`${BASE_URL}/pages/${pageId}`, { method: "PATCH", headers: headers(), body: JSON.stringify({ in_trash: true }) });
  if (!res.ok) throw new Error(`Notion (${res.status}): ${await res.text()}`);
}

// Adds a file to the item, keeping the files already attached.
async function addFile(pageId, filename, contentType, dataBase64) {
  const upload = await uploadFile(filename, contentType, dataBase64);
  const page = await (await fetch(`${BASE_URL}/pages/${pageId}`, { headers: headers() })).json();
  const existing = page.properties?.["Archivos"]?.files || [];
  const res = await fetch(`${BASE_URL}/pages/${pageId}`, { method: "PATCH", headers: headers(), body: JSON.stringify({ properties: { "Archivos": { files: [...existing, ...upload] } } }) });
  if (!res.ok) throw new Error(`Notion (${res.status}): ${await res.text()}`);
  return toItem(await res.json());
}

module.exports = { listItems, saveItem, deleteItem, addFile, KINDS, splitDate, dateValue };
