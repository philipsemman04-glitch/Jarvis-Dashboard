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

const { createPage, updatePage, queryDatabase, getTitle, richText, todayISO, fitToSchema, personText } = require("./_notion");
const TIMEZONE = process.env.JARVIS_TIMEZONE || "America/Mexico_City";
const calendarItems = require("./_calendar");

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

// Every Master Actions write goes through the real schema (see fitToSchema
// in _notion.js), so a field the database doesn't have can't make the
// whole save fail.
const fitToActionsSchema = (properties, person) => fitToSchema(DB_ACTIONS, properties, person);

// Completion Date should record when a task was actually finished — so it
// is only set on the transition INTO "Terminado" (and cleared if the task
// is reopened), never re-stamped every time a finished task is edited.
async function completionDateChange(pageId, newStatus) {
  const r = await fetch(`https://api.notion.com/v1/pages/${pageId}`, { headers: headers() });
  if (!r.ok) throw new Error(`Notion page fetch failed (${r.status}): ${await r.text()}`);
  const current = (await r.json()).properties?.["Status"]?.select?.name || null;
  if (newStatus === "Terminado" && current !== "Terminado") return { "Completion Date": { date: { start: todayISO() } } };
  if (newStatus !== "Terminado" && current === "Terminado") return { "Completion Date": { date: null } };
  return {};
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
    collaborators: personText(props), owner: personText(props), targetDate: props["Target Date"]?.date?.start || null,
    areaIds: relationIds(props["Related Entity"]), tags: (props["Tags"]?.multi_select || []).map(t => t.name),
    attachments: fileList(props["Attachments"]),
    comments,
  });
}

// "Priority" (P0–P4) is the one priority Jarvis shows; "Priority Level" is
// kept in step with it so Notion never holds two disagreeing priorities.
const LEVEL_FOR_PRIORITY = { P0: "Critical", P1: "High", P2: "Medium", P3: "Low", P4: "Low" };
function levelFor(priority, priorityLevel) {
  if (priorityLevel !== undefined && priorityLevel !== null && priorityLevel !== "") return priorityLevel;
  return priority === undefined ? undefined : (LEVEL_FOR_PRIORITY[priority] || "");
}

async function handleCreate(req, res) {
  const { taskName, project, priority, priorityLevel, targetDate, area, description } = req.body || {};
  if (!taskName || !taskName.trim()) { res.status(400).json({ error: "taskName is required" }); return; }
  const properties = {
    "Task Name": { title: [{ text: { content: taskName.trim() } }] },
    Status: { select: { name: "No iniciado" } },
  };
  if (priority) properties["Priority"] = { select: { name: priority } };
  const level = levelFor(priority, priorityLevel);
  if (level) properties["Priority Level"] = { select: { name: level } };
  if (project && project !== "Sin proyecto") properties["Project"] = { select: { name: project } };
  if (targetDate) properties["Target Date"] = { date: { start: targetDate } };
  if (description) properties["Description"] = richText(description);

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
  const fitted = await fitToActionsSchema(properties);
  const page = await createPage(DB_ACTIONS, fitted.properties);
  res.status(200).json({ ok: true, pageId: page.id, areaMatched, areaWarning, skipped: fitted.skipped });
}

async function handleUpdateStatus(req, res) {
  const { pageId, status } = req.body || {};
  if (!pageId || !status) { res.status(400).json({ error: "pageId and status are required" }); return; }
  const fitted = await fitToActionsSchema({ Status: { select: { name: status } }, ...(await completionDateChange(pageId, status)) });
  const result = await updatePage(pageId, fitted.properties);
  res.status(200).json({ ok: true, pageId: result.id, skipped: fitted.skipped });
}

async function handleUpdateFull(req, res) {
  const { pageId, taskName, description, status, priority, priorityLevel: rawLevel, collaborators, owner, targetDate, type, impact, urgency, wave, tags, blocksLaunch, driveLink } = req.body || {};
  if (!pageId) { res.status(400).json({ error: "pageId is required" }); return; }
  const properties = {};
  if (taskName !== undefined) properties["Task Name"] = { title: [{ text: { content: taskName } }] };
  if (description !== undefined) properties["Description"] = richText(description);
  if (status) {
    properties["Status"] = { select: { name: status } };
    Object.assign(properties, await completionDateChange(pageId, status));
  }
  // Empty value = "Sin prioridad" in the form → clears the field instead of
  // defaulting to P0.
  if (priority !== undefined) properties["Priority"] = priority ? { select: { name: priority } } : { select: null };
  const priorityLevel = priority !== undefined ? levelFor(priority, undefined) : rawLevel;
  if (priorityLevel !== undefined) properties["Priority Level"] = priorityLevel ? { select: { name: priorityLevel } } : { select: null };
  if (targetDate !== undefined) properties["Target Date"] = targetDate ? { date: { start: targetDate } } : { date: null };
  if (type !== undefined) properties["Type"] = type ? { select: { name: type } } : { select: null };
  if (impact !== undefined) properties["Impact"] = impact ? { select: { name: impact } } : { select: null };
  if (urgency !== undefined) properties["Urgency"] = urgency ? { select: { name: urgency } } : { select: null };
  if (wave !== undefined) properties["Ola"] = wave ? { select: { name: wave } } : { select: null };
  if (tags !== undefined) properties["Tags"] = { multi_select: Array.isArray(tags) ? tags.filter(Boolean).map(name => ({ name })) : String(tags || "").split(",").map(x => x.trim()).filter(Boolean).map(name => ({ name })) };
  if (blocksLaunch !== undefined) properties["Blocks Launch"] = { checkbox: !!blocksLaunch };
  if (driveLink !== undefined) properties["Drive Link"] = driveLink ? { url: driveLink } : { url: null };
  // Pages send the responsible person as `owner` (ONG) or `collaborators`
  // (Tareas, project boards); both mean the same field.
  const person = owner !== undefined ? owner : collaborators;
  const fitted = await fitToActionsSchema(properties, person);
  const result = await updatePage(pageId, fitted.properties);
  res.status(200).json({ ok: true, pageId: result.id, skipped: fitted.skipped });
}

async function handleUpdateArea(req, res) {
  const { pageId, area, project } = req.body || {};
  if (!pageId || !area) { res.status(400).json({ error: "pageId and area are required" }); return; }
  // Dropping a task on the "Sin área" column removes its area.
  if (area.trim() === "Sin área") {
    const result = await updatePage(pageId, { "Related Entity": { relation: [] } });
    res.status(200).json({ ok: true, pageId: result.id });
    return;
  }
  // Area names repeat across projects (every scaffolded project gets
  // "Legal", "Content", …), so only match areas of the task's own project.
  const entityPages = await queryDatabase(DB_ENTITIES, project ? { filter: { property: "Empresa", select: { equals: project } } } : {});
  const target = area.trim().toLowerCase();
  const matches = entityPages.filter((p) => getTitle(p.properties, "Entity Name").toLowerCase() === target);
  if (!matches.length) { res.status(404).json({ error: `No area named "${area}" found${project ? ` in ${project}` : ""}.` }); return; }
  if (matches.length > 1 && !project) { res.status(409).json({ error: `Several projects have an area named "${area}" — project is required.` }); return; }
  const match = matches[0];
  const result = await updatePage(pageId, { "Related Entity": { relation: [{ id: match.id }] } });
  res.status(200).json({ ok: true, pageId: result.id });
}

// General Calendar — merges Master Actions (deadlines + completions, which
// already carry a real Project) with the Meetings database. One combined,
// filterable event list instead of separate disconnected calendars.
async function calendarEvents() {
  const DB_MEETINGS_DATA_SOURCE = process.env.NOTION_DB_MEETINGS || "ad03f382-6e63-4e86-b905-32772e16600c";
  const [actionPages, meetingPages] = await Promise.all([
    queryDatabase(DB_ACTIONS, {}),
    queryDatabase(DB_MEETINGS_DATA_SOURCE, {}).catch(() => []), // degrade gracefully if not shared yet
  ]);

  const events = [];
  actionPages.forEach((p) => {
    const props = p.properties;
    const taskName = text(props["Task Name"]);
    const project = select(props["Project"]) || "Personal";
    const person = personText(props);
    const targetDate = props["Target Date"]?.date?.start;
    const completionDate = props["Completion Date"]?.date?.start;
    const status = select(props["Status"]);
    if (targetDate && status !== "Terminado" && status !== "Cancelado") {
      events.push({ id: p.id, url: p.url, date: targetDate.slice(0, 10), title: taskName, type: "deadline", project, person, status, priority: select(props["Priority"]) });
    }
    if (completionDate) {
      events.push({ id: p.id, url: p.url, date: completionDate.slice(0, 10), title: taskName, type: "completado", project, person, status });
    }
  });
  meetingPages.forEach((p) => {
    const props = p.properties;
    const date = props["Date"]?.date?.start;
    if (!date) return;
    const when = calendarItems.splitDate(props["Date"]?.date);
    events.push({
      id: p.id, url: p.url, date: date.slice(0, 10), time: when.time, endTime: when.endTime, title: text(props["Meeting Name"]),
      type: "meeting", project: null, person: null, status: select(props["Status"]), platform: text(props["Platform"]),
    });
  });
  // Events, appointments, reminders and notes from the Jarvis calendar database.
  (await calendarItems.listItems().catch((err) => { console.error("Calendar items unavailable:", err.message); return []; }))
    .filter((it) => it.date)
    .forEach((it) => events.push({ ...it, type: it.kind, status: it.kind === "reminder" ? (it.done ? "Hecho" : "Pendiente") : null, person: null }));

  const projects = [...new Set(events.map(e => e.project).filter(Boolean))].sort();
  return { events, projects };
}
async function handleCalendar(req, res) {
  res.status(200).json(await calendarEvents());
}

// iCalendar feed of the whole Jarvis calendar (optionally one project), so
// Google Calendar can subscribe to it with "Otros calendarios → Desde URL".
async function handleIcs(req, res) {
  const { events } = await calendarEvents();
  const project = req.query?.project;
  const clean = (v) => String(v || "").replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/([,;])/g, "\\$1");
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  const nextDay = (d) => { const x = new Date(d + "T12:00:00Z"); x.setUTCDate(x.getUTCDate() + 1); return x.toISOString().slice(0, 10).replace(/-/g, ""); };
  const label = { deadline: "Tarea", completado: "Terminada", meeting: "Reunión", event: "Evento", appointment: "Cita", reminder: "Recordatorio", note: "Nota" };
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Jarvis//Calendario//ES", "CALSCALE:GREGORIAN", `X-WR-CALNAME:${clean(project ? "Jarvis · " + project : "Jarvis")}`, `X-WR-TIMEZONE:${TIMEZONE}`];
  events.filter((e) => e.date && (!project || e.project === project || (e.type === "meeting" && !e.project))).forEach((e) => {
    const day = e.date.replace(/-/g, "");
    lines.push("BEGIN:VEVENT", `UID:${e.id}-${e.type}@jarvis`, `DTSTAMP:${stamp}`);
    if (e.time) {
      lines.push(`DTSTART;TZID=${TIMEZONE}:${day}T${e.time.replace(":", "")}00`);
      const end = e.endTime || `${String(Math.min(23, Number(e.time.slice(0, 2)) + 1)).padStart(2, "0")}:${e.time.slice(3, 5)}`;
      lines.push(`DTEND;TZID=${TIMEZONE}:${day}T${end.replace(":", "")}00`);
    } else {
      lines.push(`DTSTART;VALUE=DATE:${day}`, `DTEND;VALUE=DATE:${nextDay(e.date)}`);
    }
    lines.push(`SUMMARY:${clean(`${label[e.type] || ""}: ${e.title || "(sin título)"}`)}`);
    const desc = [e.project, e.status, e.notes].filter(Boolean).join(" · ");
    if (desc) lines.push(`DESCRIPTION:${clean(desc)}`);
    if (e.place) lines.push(`LOCATION:${clean(e.place)}`);
    if (e.url) lines.push(`URL:${e.url}`);
    lines.push("END:VEVENT");
  });
  lines.push("END:VCALENDAR");
  res.setHeader("Content-Type", "text/calendar; charset=utf-8");
  res.setHeader("Content-Disposition", 'inline; filename="jarvis.ics"');
  res.status(200).send(lines.map((l) => l.length > 74 ? l.match(/.{1,73}/gu).join("\r\n ") : l).join("\r\n"));
}

const DB_MEETINGS_DATA_SOURCE = process.env.NOTION_DB_MEETINGS || "ad03f382-6e63-4e86-b905-32772e16600c";
async function handleCalendarCreate(req, res) {
  const { type = "deadline", title, date, time, endTime, project, person, status = "Scheduled" } = req.body || {};
  if (!title || !title.trim() || !date) { res.status(400).json({ error: "title and date are required" }); return; }
  if (type === "meeting") {
    const page = await createPage(DB_MEETINGS_DATA_SOURCE, {
      "Meeting Name": { title: [{ text: { content: title.trim() } }] },
      Date: calendarItems.dateValue(date.slice(0, 10), time, endTime),
      Status: { select: { name: status } },
    });
    res.status(200).json({ ok: true, pageId: page.id });
    return;
  }
  const properties = {
    "Task Name": { title: [{ text: { content: title.trim() } }] },
    Status: { select: { name: "No iniciado" } },
    "Target Date": { date: { start: date } },
  };
  if (project) properties.Project = { select: { name: project } };
  const fitted = await fitToActionsSchema(properties, person || undefined);
  const page = await createPage(DB_ACTIONS, fitted.properties);
  res.status(200).json({ ok: true, pageId: page.id, skipped: fitted.skipped });
}

async function handleCalendarUpdate(req, res) {
  const { pageId, type = "deadline", title, date, time, endTime, person, status } = req.body || {};
  // A finished task is edited without a date: its calendar day is its
  // Completion Date, which must not overwrite the Target Date.
  if (!pageId || !title || !title.trim() || (!date && type !== "completado")) { res.status(400).json({ error: "pageId, title and date are required" }); return; }
  if (type === "meeting") {
    const result = await updatePage(pageId, {
      "Meeting Name": { title: [{ text: { content: title.trim() } }] },
      Date: calendarItems.dateValue(date.slice(0, 10), time, endTime),
      ...(status ? { Status: { select: { name: status } } } : {}),
    });
    res.status(200).json({ ok: true, pageId: result.id });
    return;
  }
  const fitted = await fitToActionsSchema({
    "Task Name": { title: [{ text: { content: title.trim() } }] },
    ...(date ? { "Target Date": { date: { start: date } } } : {}),
  }, person);
  const result = await updatePage(pageId, fitted.properties);
  res.status(200).json({ ok: true, pageId: result.id, skipped: fitted.skipped });
}

async function handleCalendarArchive(req, res) {
  const { pageId } = req.body || {};
  if (!pageId) { res.status(400).json({ error: "pageId is required" }); return; }
  const r = await fetch(`https://api.notion.com/v1/pages/${pageId}`, { method: "PATCH", headers: headers(), body: JSON.stringify({ archived: true }) });
  if (!r.ok) throw new Error(`Calendar archive failed (${r.status}): ${await r.text()}`);
  res.status(200).json({ ok: true });
}

// ---- Decision Log — real database (Status is a status-typed property, so
// writes use { status: { name } } not select). ----
const DB_DECISIONS = process.env.NOTION_DB_DECISIONS || "50b48347-9a7f-48a2-8876-ed3381a285ab";

async function handleDecisionsList(req, res) {
  const [decisionPages, entitiesRes] = await Promise.all([
    queryDatabase(DB_DECISIONS, {}),
    queryDatabase(DB_ENTITIES, {}),
  ]);
  const areaNameById = {};
  entitiesRes.forEach((p) => { areaNameById[p.id] = text(p.properties["Entity Name"]); });

  const decisions = decisionPages.map((p) => {
    const props = p.properties;
    const areaIds = relationIds(props["Area"]);
    return {
      id: p.id, notionUrl: p.url,
      decision: text(props["Decision"]), status: props["Status"]?.status?.name || "Pending",
      impact: select(props["Impact"]), area: areaIds.length ? (areaNameById[areaIds[0]] || null) : null,
      context: text(props["Context"]), optionsConsidered: text(props["Options Considered"]),
      finalDecision: text(props["Final Decision"]), date: props["Date"]?.date?.start || null,
    };
  });
  res.status(200).json({ decisions, areas: [...new Set(decisions.map(d => d.area).filter(Boolean))].sort() });
}

async function handleDecisionCreate(req, res) {
  const { decision, status, impact, context } = req.body || {};
  if (!decision || !decision.trim()) { res.status(400).json({ error: "decision is required" }); return; }
  const properties = {
    Decision: { title: [{ text: { content: decision.trim() } }] },
    Status: { status: { name: status || "Pending" } },
  };
  if (impact) properties["Impact"] = { select: { name: impact } };
  if (context) properties["Context"] = richText(context);
  const page = await createPage(DB_DECISIONS, properties);
  res.status(200).json({ ok: true, pageId: page.id });
}

async function handleDecisionUpdate(req, res) {
  const { pageId, status, impact, context, optionsConsidered, finalDecision } = req.body || {};
  if (!pageId) { res.status(400).json({ error: "pageId is required" }); return; }
  const properties = {};
  if (status) properties["Status"] = { status: { name: status } };
  if (impact !== undefined) properties["Impact"] = impact ? { select: { name: impact } } : { select: null };
  if (context !== undefined) properties["Context"] = richText(context);
  if (optionsConsidered !== undefined) properties["Options Considered"] = richText(optionsConsidered);
  if (finalDecision !== undefined) properties["Final Decision"] = richText(finalDecision);
  const result = await updatePage(pageId, properties);
  res.status(200).json({ ok: true, pageId: result.id });
}

// ---- Meetings — real database, already used by the calendar merge ----
const DB_MEETINGS = process.env.NOTION_DB_MEETINGS || "ad03f382-6e63-4e86-b905-32772e16600c";

async function handleMeetingsList(req, res) {
  const pages = await queryDatabase(DB_MEETINGS, { sorts: [{ property: "Date", direction: "descending" }] });
  const meetings = pages.map((p) => {
    const props = p.properties;
    return {
      id: p.id, notionUrl: p.url,
      name: text(props["Meeting Name"]), date: props["Date"]?.date?.start || null,
      endDate: props["End Date"]?.date?.start || null, platform: text(props["Platform"]), recurrence: text(props["Recurrence"]), duration: text(props["Duration"]),
      status: select(props["Status"]), summary: text(props["Summary"]),
      decisions: text(props["Decisions"]), notes: text(props["Notes"]), evaluation: text(props["Evaluation"]), rating: props["Rating"]?.number ?? null, transcript: text(props["Transcript"]), topics: text(props["Topics"]), attachments: fileList(props["Attachments"]),
    };
  });
  res.status(200).json({ meetings });
}

async function handleMeetingCreate(req, res) {
  const { name, date, status } = req.body || {};
  if (!name || !name.trim()) { res.status(400).json({ error: "name is required" }); return; }
  const properties = {
    "Meeting Name": { title: [{ text: { content: name.trim() } }] },
    Status: { select: { name: status || "Scheduled" } },
  };
  if (date) properties["Date"] = { date: { start: date } };
  const page = await createPage(DB_MEETINGS, properties);
  res.status(200).json({ ok: true, pageId: page.id });
}

async function handleMeetingUpdate(req, res) {
  const { pageId, name, date, endDate, platform, recurrence, duration, status, summary, decisions, notes, evaluation, rating, transcript, topics } = req.body || {};
  if (!pageId) { res.status(400).json({ error: "pageId is required" }); return; }
  const properties = {};
  if (name !== undefined) properties["Meeting Name"] = { title: [{ text: { content: name || "" } }] };
  if (date !== undefined) properties["Date"] = date ? { date: { start: date } } : { date: null };
  if (endDate !== undefined) properties["End Date"] = endDate ? { date: { start: endDate } } : { date: null };
  if (platform !== undefined) properties["Platform"] = richText(platform);
  if (recurrence !== undefined) properties["Recurrence"] = richText(recurrence);
  if (duration !== undefined) properties["Duration"] = richText(duration);
  if (status) properties["Status"] = { select: { name: status } };
  if (summary !== undefined) properties["Summary"] = richText(summary);
  if (decisions !== undefined) properties["Decisions"] = richText(decisions);
  if (notes !== undefined) properties["Notes"] = richText(notes);
  if (evaluation !== undefined) properties["Evaluation"] = richText(evaluation);
  if (rating !== undefined) properties["Rating"] = { number: rating === null ? null : Number(rating) };
  if (transcript !== undefined) properties["Transcript"] = richText(transcript);
  if (topics !== undefined) properties["Topics"] = richText(topics);
  const pageRes = await fetch(`https://api.notion.com/v1/pages/${pageId}`, { headers: headers() });
  if (!pageRes.ok) throw new Error(`Meeting fetch failed (${pageRes.status}): ${await pageRes.text()}`);
  const page = await pageRes.json();
  const writable = Object.fromEntries(Object.entries(properties).filter(([key]) => page.properties?.[key]));
  if (!Object.keys(writable).length) { res.status(400).json({ error: "No editable meeting fields are available in the Notion schema." }); return; }
  const result = await updatePage(pageId, writable);
  res.status(200).json({ ok: true, pageId: result.id });
}

function writableValue(prop) {
  switch (prop?.type) {
    case "title": return { title: (prop.title || []).map(t => ({ text: { content: t.plain_text } })) };
    case "rich_text": return { rich_text: (prop.rich_text || []).map(t => ({ text: { content: t.plain_text } })) };
    case "number": return { number: prop.number };
    case "checkbox": return { checkbox: !!prop.checkbox };
    case "url": return { url: prop.url };
    case "email": return { email: prop.email };
    case "phone_number": return { phone_number: prop.phone_number };
    case "select": return { select: prop.select ? { name: prop.select.name } : null };
    case "status": return prop.status ? { status: { name: prop.status.name } } : null;
    case "multi_select": return { multi_select: (prop.multi_select || []).map(o => ({ name: o.name })) };
    case "date": return { date: prop.date ? { start: prop.date.start, end: prop.date.end || null } : null };
    case "relation": return { relation: (prop.relation || []).map(r => ({ id: r.id })) };
    case "people": return { people: (prop.people || []).map(p => ({ id: p.id })) };
    case "files": {
      const external = (prop.files || []).filter(f => f.type === "external");
      return external.length ? { files: external.map(f => ({ type: "external", name: f.name, external: { url: f.external.url } })) } : null;
    }
    default: return null; // formula, rollup, created_time, unique_id, … are read-only
  }
}

async function handleMeetingDuplicate(req, res) {
  const { pageId } = req.body || {};
  if (!pageId) { res.status(400).json({ error: "pageId is required" }); return; }
  const pages = await queryDatabase(DB_MEETINGS, {});
  const source = pages.find((p) => p.id === pageId);
  if (!source) { res.status(404).json({ error: "Meeting not found" }); return; }
  // Notion returns read-only property types (formulas, rollups, created
  // time, …) and Notion-hosted files that can't be re-submitted — copy only
  // the writable ones, converted back into the shape Notion accepts.
  const properties = {};
  for (const [key, prop] of Object.entries(source.properties || {})) {
    const writable = writableValue(prop);
    if (writable) properties[key] = writable;
  }
  if (properties["Meeting Name"]) properties["Meeting Name"] = { title: [{ text: { content: `${text(source.properties["Meeting Name"])} (copy)` } }] };
  const page = await createPage(DB_MEETINGS, properties);
  res.status(200).json({ ok: true, pageId: page.id });
}
async function handleMeetingArchive(req, res) {
  const { pageId } = req.body || {};
  if (!pageId) { res.status(400).json({ error: "pageId is required" }); return; }
  const r = await fetch(`https://api.notion.com/v1/pages/${pageId}`, { method: "PATCH", headers: headers(), body: JSON.stringify({ archived: true }) });
  if (!r.ok) throw new Error(`Meeting archive failed (${r.status}): ${await r.text()}`);
  res.status(200).json({ ok: true });
}

async function handleComment(req, res) {
  const { pageId, text: commentText } = req.body || {};
  if (!pageId || !commentText || !commentText.trim()) { res.status(400).json({ ok: false, error: "pageId and text are required" }); return; }  const r = await fetch("https://api.notion.com/v1/comments", {
    method: "POST", headers: headers(),
    body: JSON.stringify({ parent: { page_id: pageId }, rich_text: richText(commentText.trim()).rich_text }),
  });
  if (r.status === 403) throw Object.assign(new Error("Notion no permite comentar todavía: en notion.so/profile/integrations abre la integración de Jarvis y activa «Leer comentarios» e «Insertar comentarios»."), { status: 403 });
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
  res.setHeader("Cache-Control", "no-store, max-age=0");
  if (!NOTION_TOKEN) { res.status(500).json({ ok: false, error: "NOTION_TOKEN not set" }); return; }
  try {
    if (req.method === "GET" && req.query?.action === "detail") return await handleDetail(req, res);
    if (req.method === "GET" && req.query?.action === "calendar") return await handleCalendar(req, res);
    if (req.method === "GET" && req.query?.action === "ics") return await handleIcs(req, res);
    // Just the Jarvis calendar items (events, reminders, notes), optionally for one project.
    if (req.method === "GET" && req.query?.action === "calendar-items") {
      const project = req.query.project;
      const items = (await calendarItems.listItems()).filter((it) => !project || it.project === project);
      return res.status(200).json({ items });
    }
    if (req.method === "GET" && req.query?.action === "decisions") return await handleDecisionsList(req, res);
    if (req.method === "GET" && req.query?.action === "meetings") return await handleMeetingsList(req, res);
    if (req.method === "POST") {
      const action = req.body?.action;
      if (action === "create") return await handleCreate(req, res);
      if (action === "update-status") return await handleUpdateStatus(req, res);
      if (action === "update-full") return await handleUpdateFull(req, res);
      if (action === "update-area") return await handleUpdateArea(req, res);
      if (action === "comment") return await handleComment(req, res);
      if (action === "upload") return await handleUpload(req, res);
      if (action === "create-decision") return await handleDecisionCreate(req, res);
      if (action === "update-decision") return await handleDecisionUpdate(req, res);
      if (action === "create-meeting") return await handleMeetingCreate(req, res);
      if (action === "update-meeting") return await handleMeetingUpdate(req, res);
      if (action === "duplicate-meeting") return await handleMeetingDuplicate(req, res);
      if (action === "archive-meeting") return await handleMeetingArchive(req, res);
      if (action === "calendar-create") return await handleCalendarCreate(req, res);
      if (action === "calendar-update") return await handleCalendarUpdate(req, res);
      if (action === "calendar-archive") return await handleCalendarArchive(req, res);
      if (action === "calendar-item-save") return res.status(200).json({ ok: true, item: await calendarItems.saveItem(req.body || {}) });
      if (action === "calendar-item-delete") {
        if (!req.body?.pageId) return res.status(400).json({ error: "pageId is required" });
        await calendarItems.deleteItem(req.body.pageId);
        return res.status(200).json({ ok: true });
      }
      if (action === "calendar-item-file") {
        const { pageId, filename, contentType, dataBase64 } = req.body || {};
        if (!pageId || !filename || !dataBase64) return res.status(400).json({ error: "pageId, filename and dataBase64 are required" });
        return res.status(200).json({ ok: true, item: await calendarItems.addFile(pageId, filename, contentType, dataBase64) });
      }
    }
    res.status(400).json({ error: "Unknown or missing action" });
  } catch (err) {
    // A real error status (not 200), so every page's `if (!r.ok)` check
    // shows the failure instead of a false "Guardado".
    console.error(err);
    res.status(err.status || 500).json({ ok: false, error: err.message });
  }
};
