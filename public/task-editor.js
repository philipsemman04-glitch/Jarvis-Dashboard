/*
 * Task editor shared by every task board (One Night Guest, RoutePup /
 * StatStrike / Nikita and Tareas & Proyectos), laid out like the "Edit
 * Reference" mockup: title, status, priority, area, responsible, due date,
 * link, tags, description/notes, files & images, comments, more details,
 * and Delete / Cancel / Save. Everything is saved to the task in Notion.
 *
 * JarvisTaskEditor.open(pageId, {
 *   task,      // the task as the page already has it (shown while loading)
 *   areas,     // [{ id, name }] areas of the task's project, for the Área select
 *   project,   // project name, needed to move the task to another area
 *   onSaved,   // called after any change (save, upload, delete…) so the page reloads
 * })
 */
(function () {
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const safeUrl = (u) => { try { const x = new URL(String(u || ""), location.origin); return /^https?:$/.test(x.protocol) ? x.href : ""; } catch (e) { return ""; } };
  const STATUSES = ["No iniciado", "Preparación", "En progreso", "En revisión", "En validación", "Bloqueado", "Terminado", "Cancelado"];
  const STATUS_COLOR = { "No iniciado": "#8ea3b8", "Preparación": "#8ea3b8", "En progreso": "#5aa9f0", "En revisión": "#a585f2", "En validación": "#a585f2", "Bloqueado": "#ef6d73", "Terminado": "#46d49c", "Cancelado": "#6b7280" };
  const PRIOS = [["P0", "Crítica", "#ef6d73"], ["P1", "Alta", "#f0a64a"], ["P2", "Media", "#e8c45d"], ["P3", "Baja", "#46d49c"], ["P4", "Futuro", "#8ea3b8"], ["", "Sin prioridad", "#5b6b7c"]];
  const LEVEL_FOR = { P0: "Critical", P1: "High", P2: "Medium", P3: "Low", P4: "Low" };
  const toast = () => window.jarvisToast || { loading: () => null, success() {}, error(_, m) { alert(m); } };
  const fmt = (s, withTime) => { if (!s) return ""; const d = new Date(String(s).length === 10 ? s + "T12:00:00" : s); return isNaN(d) ? "" : d.toLocaleString("es-MX", withTime ? { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" } : { day: "numeric", month: "short", year: "numeric" }); };

  const style = document.createElement("style");
  style.textContent = `
.jte-bg{position:fixed;inset:0;z-index:150;background:#020812cc;backdrop-filter:blur(6px);display:flex;align-items:flex-start;justify-content:center;padding:28px 16px;overflow-y:auto;font-family:Inter,system-ui,sans-serif}
.jte{width:min(780px,100%);background:linear-gradient(180deg,#112338,#0a1626);border:1px solid #e8c45d55;border-radius:18px;box-shadow:0 30px 90px #000c;color:#f3f1ea;position:relative}
.jte *{box-sizing:border-box}
.jte-head{display:flex;gap:14px;align-items:flex-start;padding:20px 22px 14px;border-bottom:1px solid #8ec3ee22}
.jte-ico{width:46px;height:46px;border-radius:12px;border:1.5px solid #e8c45d;display:grid;place-items:center;color:#e8c45d;flex-shrink:0;background:#07121f}
.jte-head h2{margin:0;font:600 22px Fraunces,Georgia,serif}
.jte-head p{margin:3px 0 0;color:#a5b5c4;font-size:12px}
.jte-x{margin-left:auto;background:none;border:0;color:#a5b5c4;font-size:22px;cursor:pointer;line-height:1;padding:4px 6px;border-radius:8px}
.jte-x:hover{color:#fff;background:#ffffff12}
.jte-body{padding:16px 22px 6px;display:flex;flex-direction:column;gap:16px}
.jte-lbl{display:block;font-size:11px;font-weight:700;color:#a5b5c4;margin-bottom:6px;letter-spacing:.02em}
.jte-in,.jte-sel,.jte-ta{width:100%;background:#0a1829;border:1px solid #8ec3ee40;color:#f3f1ea;border-radius:10px;padding:10px 12px;font:13px Inter,system-ui,sans-serif;outline:none}
.jte-in:focus,.jte-sel:focus,.jte-ta:focus{border-color:#e8c45d;box-shadow:0 0 0 3px #e8c45d1f}
.jte-title{font:600 19px Fraunces,Georgia,serif;padding:12px 14px}
.jte-ta{min-height:110px;resize:vertical;line-height:1.5}
.jte-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.jte-iconfield{position:relative}.jte-iconfield .jte-in,.jte-iconfield .jte-sel{padding-left:34px}
.jte-iconfield>i{position:absolute;left:12px;top:50%;transform:translateY(-50%);font-style:normal;color:#8ea3b8;font-size:13px;pointer-events:none}
.jte-dot{width:10px;height:10px;border-radius:50%;display:inline-block}
.jte-prios{display:flex;gap:6px;flex-wrap:wrap}
.jte-prio{border:1px solid #8ec3ee40;background:#0a1829;color:#c9d6e2;border-radius:999px;padding:6px 11px;font-size:11.5px;font-weight:700;cursor:pointer;display:flex;gap:6px;align-items:center}
.jte-prio.on{border-color:var(--c);background:color-mix(in srgb,var(--c) 18%,transparent);color:#fff}
.jte-row{display:flex;gap:8px}
.jte-btn{border:1px solid #8ec3ee47;background:#0c1c2e;color:#f3f1ea;border-radius:10px;padding:9px 14px;font-size:12.5px;font-weight:700;cursor:pointer;white-space:nowrap;text-decoration:none;display:inline-flex;align-items:center;gap:6px}
.jte-btn:hover{border-color:#e8c45d}
.jte-btn.gold{background:linear-gradient(135deg,#f2d27e,#cf9f3f);color:#1f1606;border-color:#f3da8f}
.jte-btn.outline-gold{border-color:#e8c45d;color:#f3d98f;background:transparent}
.jte-btn.danger{border-color:#ef6d7399;color:#ff9aa0;background:#ef6d7310}
.jte-btn:disabled{opacity:.5;cursor:default}
.jte-tags{display:flex;flex-wrap:wrap;gap:6px;align-items:center;background:#0a1829;border:1px solid #8ec3ee40;border-radius:10px;padding:7px 8px;min-height:42px}
.jte-tag{display:inline-flex;align-items:center;gap:5px;border:1px solid #5aa9f066;background:#5aa9f018;color:#cfe5fb;border-radius:999px;padding:4px 9px;font-size:11.5px;font-weight:600}
.jte-tag button{background:none;border:0;color:#9fc4e8;cursor:pointer;padding:0;font-size:13px;line-height:1}
.jte-tags input{flex:1;min-width:120px;background:none;border:0;color:#f3f1ea;outline:none;font:12.5px Inter,system-ui,sans-serif;padding:4px}
.jte-files{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:10px}
.jte-drop{grid-column:span 2;border:1.5px dashed #8ec3ee66;border-radius:12px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;padding:14px;text-align:center;color:#a5b5c4;font-size:11.5px;cursor:pointer;min-height:118px;background:#0a182966}
.jte-drop b{color:#f3f1ea;font-size:13px}
.jte-drop.over{border-color:#e8c45d;background:#e8c45d12}
.jte-file{position:relative;border:1px solid #8ec3ee33;border-radius:12px;overflow:hidden;background:#0a1829;min-height:118px;display:flex;flex-direction:column;text-decoration:none;color:#f3f1ea}
.jte-file .th{flex:1;min-height:80px;background:#0d2034 center/cover no-repeat;display:grid;place-items:center;font-weight:800;font-size:13px;color:#e8c45d}
.jte-file .nm{font-size:10.5px;padding:6px 8px;color:#c9d6e2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.jte-file .rm{position:absolute;top:5px;right:5px;width:24px;height:24px;border-radius:7px;border:1px solid #ffffff33;background:#050b14cc;color:#ff9aa0;cursor:pointer;font-size:13px;display:grid;place-items:center;padding:0}
.jte-comments{display:flex;flex-direction:column;gap:8px}
.jte-comment{display:flex;gap:10px;border:1px solid #8ec3ee22;background:#0a182999;border-radius:12px;padding:10px 12px}
.jte-av{width:32px;height:32px;border-radius:50%;background:#e8c45d22;border:1px solid #e8c45d66;color:#e8c45d;display:grid;place-items:center;font-size:11px;font-weight:800;flex-shrink:0}
.jte-comment small{color:#7890a4;font-size:10.5px;margin-left:6px}
.jte-comment p{margin:3px 0 0;font-size:12.5px;color:#d9e2ea;white-space:pre-wrap;line-height:1.45}
.jte details{border:1px solid #8ec3ee22;border-radius:12px;padding:10px 14px;background:#0a182966}
.jte summary{cursor:pointer;font-size:12.5px;font-weight:700;color:#c9d6e2}
.jte-meta{font-size:11px;color:#7890a4;display:flex;gap:14px;flex-wrap:wrap}
.jte-foot{display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:14px 22px 20px;border-top:1px solid #8ec3ee22;margin-top:10px}
.jte-foot .left{margin-right:auto}
.jte-empty{color:#7890a4;font-size:12px;font-style:italic}
.jte-check{display:flex;gap:8px;align-items:center;font-size:12.5px;color:#d9e2ea}
@media(max-width:640px){.jte-grid{grid-template-columns:1fr}.jte-drop{grid-column:span 1}.jte-bg{padding:10px 8px}.jte-head,.jte-body,.jte-foot{padding-left:14px;padding-right:14px}}`;
  document.head.appendChild(style);

  async function api(path, body) {
    const r = await fetch(path, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : { cache: "no-store" });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || d.error || d.ok === false) throw new Error(d.error || "Error " + r.status);
    return d;
  }
  const isImage = (f) => /\.(png|jpe?g|gif|webp|avif|svg)(\?|$)/i.test(f.name || "") || /\.(png|jpe?g|gif|webp|avif)(\?|$)/i.test(f.url || "");
  const ext = (n) => (String(n || "").split(".").pop() || "FILE").slice(0, 4).toUpperCase();

  function open(pageId, opts = {}) {
    const bg = document.createElement("div");
    bg.className = "jte-bg";
    bg.innerHTML = `<div class="jte" role="dialog" aria-modal="true"><div class="jte-head"><div class="jte-ico">✓</div><div><h2>Cargando tarea…</h2><p>Leyendo los datos desde Notion.</p></div><button class="jte-x" title="Cerrar" aria-label="Cerrar">×</button></div><div class="jte-body"><div class="jte-empty">${esc(opts.task?.taskName || "")}</div></div></div>`;
    document.body.appendChild(bg);
    document.body.style.overflow = "hidden";
    let task = { ...(opts.task || {}), id: pageId }, dirty = false, closed = false;
    const changed = () => { opts.onSaved && opts.onSaved(); };
    function close(force) {
      if (closed) return;
      if (dirty && !force && !confirm("Tienes cambios sin guardar. ¿Cerrar sin guardar?")) return;
      closed = true; bg.remove(); document.body.style.overflow = ""; removeEventListener("keydown", onKey);
    }
    const onKey = (e) => { if (e.key === "Escape") close(); };
    addEventListener("keydown", onKey);
    bg.addEventListener("mousedown", (e) => { if (e.target === bg) close(); });
    bg.querySelector(".jte-x").onclick = () => close();

    const areaList = (opts.areas || []).map((a) => (typeof a === "string" ? { id: "", name: a } : a)).filter((a) => a && a.name).sort((a, b) => a.name.localeCompare(b.name, "es"));
    const currentArea = () => { const byId = areaList.find((a) => a.id && (task.areaIds || []).includes(a.id)); return byId ? byId.name : (task.area && task.area !== "Sin área" ? task.area : ""); };
    let tags = [], prio = "";

    function render() {
      tags = [...(task.tags || [])];
      prio = task.priority || "";
      const st = task.status || "No iniciado", areaNow = currentArea();
      const files = (task.attachments || []).filter((f) => f.url);
      const box = bg.querySelector(".jte");
      box.innerHTML = `
      <div class="jte-head"><div class="jte-ico"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="3"/><path d="m8 12.3 2.7 2.7L16.2 9"/></svg></div>
        <div><h2>Editar tarea</h2><p>${esc(task.project || opts.project || "")}${task.project || opts.project ? " · " : ""}Ve y edita todos los detalles. Los cambios se guardan en Notion.</p></div>
        <button class="jte-x" title="Cerrar" aria-label="Cerrar">×</button></div>
      <form class="jte-body" id="jte-form" onsubmit="return false">
        <div><label class="jte-lbl">Título de la tarea</label><input class="jte-in jte-title" name="taskName" value="${esc(task.taskName || task.name || "")}" required></div>
        <div class="jte-grid">
          <div><label class="jte-lbl">Estado</label><div class="jte-iconfield"><i><span class="jte-dot" id="jte-st-dot" style="background:${STATUS_COLOR[st] || "#8ea3b8"}"></span></i><select class="jte-sel" name="status">${STATUSES.map((s) => `<option ${s === st ? "selected" : ""}>${s}</option>`).join("")}</select></div></div>
          <div><label class="jte-lbl">Área</label><div class="jte-iconfield"><i>▦</i>${areaList.length ? `<select class="jte-sel" name="area"><option value="Sin área">Sin área</option>${areaList.map((a) => `<option ${a.name === areaNow ? "selected" : ""}>${esc(a.name)}</option>`).join("")}</select>` : `<input class="jte-in" value="${esc(areaNow || "Sin área")}" disabled>`}</div></div>
          <div><label class="jte-lbl">Responsable</label><div class="jte-iconfield"><i>👤</i><input class="jte-in" name="owner" value="${esc(task.owner || task.collaborators || "")}" placeholder="Sin asignar"></div></div>
          <div><label class="jte-lbl">Fecha límite</label><div class="jte-iconfield"><i>📅</i><input class="jte-in" type="date" name="targetDate" value="${esc(String(task.targetDate || "").slice(0, 10))}"></div></div>
        </div>
        <div><label class="jte-lbl">Prioridad</label><div class="jte-prios" id="jte-prios">${PRIOS.map(([k, l, c]) => `<button type="button" class="jte-prio ${k === prio ? "on" : ""}" data-p="${k}" style="--c:${c}"><span class="jte-dot" style="background:${c}"></span>${k ? k + " · " : ""}${l}</button>`).join("")}</div></div>
        <div><label class="jte-lbl">Enlace (Drive, documento, web…)</label><div class="jte-row"><div class="jte-iconfield" style="flex:1"><i>🔗</i><input class="jte-in" type="url" name="driveLink" value="${esc(task.driveLink || "")}" placeholder="https://"></div><a class="jte-btn outline-gold" id="jte-open-link" target="_blank" rel="noopener" href="${esc(safeUrl(task.driveLink) || "#")}">Abrir enlace ↗</a></div></div>
        <div><label class="jte-lbl">Etiquetas</label><div class="jte-tags" id="jte-tags"></div></div>
        <div><label class="jte-lbl">Descripción / notas</label><textarea class="jte-ta" name="description" placeholder="Contexto, próximos pasos, notas…">${esc(task.description || "")}</textarea></div>
        <div><label class="jte-lbl">Archivos e imágenes</label><div class="jte-files" id="jte-files">
          <label class="jte-drop" id="jte-drop"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#e8c45d" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17a4 4 0 0 1-.6-8 5.5 5.5 0 0 1 10.7-1.4A4.5 4.5 0 0 1 17.5 17"/><path d="M12 12v8M9 15l3-3 3 3"/></svg><b>Subir archivos</b>Arrastra aquí o haz clic · imágenes, PDF, documentos (máx. 3 MB)<input type="file" multiple hidden id="jte-file-input"></label>
          ${files.map((f, i) => `<a class="jte-file" href="${esc(safeUrl(f.url) || "#")}" target="_blank" rel="noopener" title="${esc(f.name)}"><div class="th" ${isImage(f) ? `style="background-image:url('${esc(safeUrl(f.url))}')"` : ""}>${isImage(f) ? "" : ext(f.name)}</div><div class="nm">${esc(f.name || "Archivo")}</div><button type="button" class="rm" data-rm="${i}" title="Quitar archivo">×</button></a>`).join("")}
        </div></div>
        <div><label class="jte-lbl">Comentarios (${(task.comments || []).length})</label><div class="jte-comments" id="jte-comments">
          <div class="jte-row"><div class="jte-av">AM</div><input class="jte-in" id="jte-comment" placeholder="Añadir un comentario…"><button type="button" class="jte-btn gold" id="jte-post">Publicar</button></div>
          ${(task.comments || []).slice().reverse().map((c) => `<div class="jte-comment"><div class="jte-av">${c.authorName === "Jarvis" ? "J" : "N"}</div><div><b style="font-size:12px">${esc(c.authorName || "Notion")}</b><small>${esc(fmt(c.createdTime, true))}</small><p>${esc(c.text)}</p></div></div>`).join("")}
        </div></div>
        <details><summary>Más detalles</summary><div class="jte-grid" style="margin-top:12px">
          <div><label class="jte-lbl">Tipo</label><select class="jte-sel" name="type"><option value="">Sin definir</option>${["Tarea", "Iniciativa", "Proyecto", "Subtarea", "Incidencia", "Experimento"].map((v) => `<option ${v === task.type ? "selected" : ""}>${v}</option>`).join("")}</select></div>
          <div><label class="jte-lbl">Impacto</label><select class="jte-sel" name="impact"><option value="">Sin definir</option>${["Alto", "Medio", "Bajo"].map((v) => `<option ${v === task.impact ? "selected" : ""}>${v}</option>`).join("")}</select></div>
          <div><label class="jte-lbl">Urgencia</label><select class="jte-sel" name="urgency"><option value="">Sin definir</option>${["Alta", "Media", "Baja"].map((v) => `<option ${v === task.urgency ? "selected" : ""}>${v}</option>`).join("")}</select></div>
          <div><label class="jte-lbl">Ola</label><select class="jte-sel" name="wave"><option value="">Ninguna</option>${["Ola 1 - Base legal y núcleo tecnológico", "Ola 2 - Conexión operativa y automatización", "Ola 3 - Validación controlada", "Ola 4 - Escalamiento", "Avatar-Contenido-Diseño (paralela)"].map((v) => `<option ${v === task.wave ? "selected" : ""}>${v}</option>`).join("")}</select></div>
          <label class="jte-check"><input type="checkbox" name="blocksLaunch" ${task.blocksLaunch ? "checked" : ""}> Bloquea el lanzamiento</label>
        </div></details>
        <div class="jte-meta">${task.createdTime ? `<span>Creada: ${esc(fmt(task.createdTime))}</span>` : ""}${task.lastEditedTime ? `<span>Última edición: ${esc(fmt(task.lastEditedTime, true))}</span>` : ""}${task.completionDate ? `<span>Terminada: ${esc(fmt(task.completionDate))}</span>` : ""}</div>
      </form>
      <div class="jte-foot"><button type="button" class="jte-btn danger left" id="jte-del">🗑 Eliminar tarea</button>${safeUrl(task.notionUrl) ? `<a class="jte-btn" href="${esc(safeUrl(task.notionUrl))}" target="_blank" rel="noopener">Abrir en Notion ↗</a>` : ""}<button type="button" class="jte-btn" id="jte-cancel">Cancelar</button><button type="button" class="jte-btn gold" id="jte-save">💾 Guardar cambios</button></div>`;
      bind();
    }

    function renderTags() {
      const el = bg.querySelector("#jte-tags");
      el.innerHTML = tags.map((t, i) => `<span class="jte-tag">${esc(t)}<button type="button" data-tag="${i}" title="Quitar">×</button></span>`).join("") + `<input id="jte-tag-in" placeholder="${tags.length ? "+ Añadir etiqueta" : "Escribe una etiqueta y pulsa Enter"}">`;
      el.querySelectorAll("[data-tag]").forEach((b) => (b.onclick = () => { tags.splice(Number(b.dataset.tag), 1); dirty = true; renderTags(); }));
      const inp = el.querySelector("#jte-tag-in");
      inp.addEventListener("keydown", (e) => {
        if ((e.key === "Enter" || e.key === ",") && inp.value.trim()) { e.preventDefault(); const v = inp.value.trim().replace(/,$/, ""); if (!tags.includes(v)) tags.push(v); dirty = true; renderTags(); bg.querySelector("#jte-tag-in").focus(); }
        else if (e.key === "Backspace" && !inp.value && tags.length) { tags.pop(); dirty = true; renderTags(); bg.querySelector("#jte-tag-in").focus(); }
      });
    }

    async function reloadDetail(keepForm) {
      const d = await api("/api/task-api?action=detail&pageId=" + encodeURIComponent(pageId) + "&fresh=" + Date.now());
      if (keepForm) { task.attachments = d.attachments; task.comments = d.comments; }
      else task = { ...task, ...d };
    }

    function formValues() {
      const f = bg.querySelector("#jte-form");
      return {
        taskName: f.elements.taskName.value.trim(), status: f.elements.status.value, owner: f.elements.owner.value.trim(), targetDate: f.elements.targetDate.value,
        driveLink: f.elements.driveLink.value.trim(), description: f.elements.description.value, type: f.elements.type.value, impact: f.elements.impact.value,
        urgency: f.elements.urgency.value, wave: f.elements.wave.value, blocksLaunch: f.elements.blocksLaunch.checked, area: f.elements.area ? f.elements.area.value : null,
      };
    }
    // Keep what the person typed when only the files or comments are refreshed.
    function rerenderKeeping() {
      const v = formValues(), keepTags = [...tags], keepPrio = prio, keepDirty = dirty;
      Object.assign(task, { taskName: v.taskName, status: v.status, owner: v.owner, targetDate: v.targetDate, driveLink: v.driveLink, description: v.description, type: v.type, impact: v.impact, urgency: v.urgency, wave: v.wave, blocksLaunch: v.blocksLaunch, tags: keepTags, priority: keepPrio });
      if (v.area !== null) task.area = v.area;
      const savedIds = task.areaIds; if (v.area !== null) task.areaIds = (areaList.find((a) => a.name === v.area) || {}).id ? [areaList.find((a) => a.name === v.area).id] : [];
      render(); dirty = keepDirty; task.areaIds = savedIds;
    }

    async function upload(fileList) {
      const filesArr = [...fileList];
      for (const file of filesArr) {
        if (file.size > 3 * 1024 * 1024) { toast().error(null, `“${file.name}” pesa más de 3 MB.`); continue; }
        const t = toast().loading(`Subiendo ${file.name}…`);
        try {
          const dataBase64 = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1]); r.onerror = rej; r.readAsDataURL(file); });
          await api("/api/task-api", { action: "upload", pageId, filename: file.name, contentType: file.type || "application/octet-stream", dataBase64 });
          toast().success(t, "Archivo subido");
        } catch (e) { toast().error(t, "No se pudo subir: " + e.message); }
      }
      try { await reloadDetail(true); } catch (e) {}
      rerenderKeeping(); changed();
    }

    function bind() {
      const box = bg.querySelector(".jte"), f = box.querySelector("#jte-form");
      box.querySelector(".jte-x").onclick = () => close();
      box.querySelector("#jte-cancel").onclick = () => close();
      f.addEventListener("input", () => { dirty = true; });
      f.elements.status.addEventListener("change", () => { box.querySelector("#jte-st-dot").style.background = STATUS_COLOR[f.elements.status.value] || "#8ea3b8"; });
      f.elements.driveLink.addEventListener("input", () => { const u = safeUrl(f.elements.driveLink.value.trim()); const a = box.querySelector("#jte-open-link"); a.href = u || "#"; a.style.opacity = u ? 1 : 0.5; });
      box.querySelector("#jte-open-link").style.opacity = safeUrl(task.driveLink) ? 1 : 0.5;
      box.querySelector("#jte-open-link").addEventListener("click", (e) => { if (box.querySelector("#jte-open-link").getAttribute("href") === "#") { e.preventDefault(); toast().error(null, "Añade un enlace primero."); } });
      box.querySelectorAll(".jte-prio").forEach((b) => (b.onclick = () => { prio = b.dataset.p; dirty = true; box.querySelectorAll(".jte-prio").forEach((x) => x.classList.toggle("on", x === b)); }));
      renderTags();
      const drop = box.querySelector("#jte-drop"), input = box.querySelector("#jte-file-input");
      input.addEventListener("change", () => { if (input.files.length) upload(input.files); });
      ["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); }));
      ["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
      drop.addEventListener("drop", (e) => { if (e.dataTransfer.files.length) upload(e.dataTransfer.files); });
      box.querySelectorAll("[data-rm]").forEach((b) => b.addEventListener("click", async (e) => {
        e.preventDefault(); e.stopPropagation();
        const file = (task.attachments || []).filter((x) => x.url)[Number(b.dataset.rm)];
        if (!confirm(`¿Quitar “${file?.name || "este archivo"}” de la tarea?`)) return;
        const t = toast().loading("Quitando archivo…");
        try {
          const index = (task.attachments || []).indexOf(file);
          await api("/api/capture", { action: "remove-file", pageId, index });
          toast().success(t, "Archivo quitado");
          await reloadDetail(true); rerenderKeeping(); changed();
        } catch (err) { toast().error(t, "No se pudo quitar: " + err.message); }
      }));
      const post = async () => {
        const inp = box.querySelector("#jte-comment"), text = inp.value.trim();
        if (!text) { inp.focus(); return; }
        const t = toast().loading("Publicando comentario…");
        try { await api("/api/task-api", { action: "comment", pageId, text }); toast().success(t, "Comentario publicado"); inp.value = ""; await reloadDetail(true); rerenderKeeping(); }
        catch (err) { toast().error(t, err.message); }
      };
      box.querySelector("#jte-post").onclick = post;
      box.querySelector("#jte-comment").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); post(); } });
      box.querySelector("#jte-del").onclick = async () => {
        if (!confirm(`¿Eliminar “${task.taskName || "esta tarea"}”? Se mueve a la papelera de Notion (se puede recuperar desde ahí).`)) return;
        const t = toast().loading("Eliminando tarea…");
        try { await api("/api/task-api", { action: "calendar-archive", pageId }); toast().success(t, "Tarea eliminada"); close(true); changed(); }
        catch (err) { toast().error(t, "No se pudo eliminar: " + err.message); }
      };
      box.querySelector("#jte-save").onclick = async () => {
        const v = formValues();
        if (!v.taskName) { f.elements.taskName.focus(); return; }
        const btn = box.querySelector("#jte-save"); btn.disabled = true; btn.textContent = "Guardando…";
        const t = toast().loading("Guardando en Notion…");
        try {
          await api("/api/task-api", { action: "update-full", pageId, taskName: v.taskName, status: v.status, priority: prio, priorityLevel: LEVEL_FOR[prio] || "", owner: v.owner, targetDate: v.targetDate, driveLink: v.driveLink, description: v.description, type: v.type, impact: v.impact, urgency: v.urgency, wave: v.wave, blocksLaunch: v.blocksLaunch, tags });
          if (v.area !== null && v.area !== (currentArea() || "Sin área")) await api("/api/task-api", { action: "update-area", pageId, area: v.area, project: task.project || opts.project });
          toast().success(t, "Tarea guardada");
          dirty = false; close(true); changed();
        } catch (err) { toast().error(t, "No se pudo guardar: " + err.message); btn.disabled = false; btn.textContent = "💾 Guardar cambios"; }
      };
    }

    api("/api/task-api?action=detail&pageId=" + encodeURIComponent(pageId) + "&fresh=" + Date.now())
      .then((d) => { task = { ...task, ...d }; if (!closed) render(); })
      .catch((e) => { if (!closed) { render(); toast().error(null, "No se pudieron leer todos los detalles: " + e.message); } });
    return { close };
  }
  window.JarvisTaskEditor = { open };
})();
