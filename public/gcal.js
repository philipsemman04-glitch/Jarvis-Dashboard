/*
 * "Ver en Google Calendar": Google Calendar subscribes to Jarvis's iCal feed
 * (/api/task-api?action=ics), so tasks, meetings, events, reminders and
 * notes appear in Aurelio's own Google Calendar and stay up to date.
 * JarvisGcal.open(project?) shows the link and the steps.
 */
(function () {
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  function open(project) {
    const feed = `${location.origin}/api/task-api?action=ics${project ? "&project=" + encodeURIComponent(project) : ""}`;
    const bg = document.createElement("div");
    bg.style.cssText = "position:fixed;inset:0;background:#000b;display:flex;align-items:center;justify-content:center;padding:16px;z-index:200;font-family:Inter,system-ui,sans-serif";
    bg.innerHTML = `<div style="background:#0f1f32;border:1px solid #8ec3ee47;border-radius:14px;padding:20px;width:min(540px,100%);color:#f3f1ea">
      <h2 style="margin:0 0 6px;font-family:Fraunces,Georgia,serif;font-weight:600;font-size:21px">Ver en Google Calendar</h2>
      <p style="margin:0 0 12px;color:#a5b5c4;font-size:12.5px;line-height:1.5">Suscribe tu Google Calendar al calendario de Jarvis${project ? ` de <b>${esc(project)}</b>` : ""}: tareas con fecha, reuniones, eventos, citas, recordatorios y notas aparecerán ahí y se actualizan solos (Google los refresca cada pocas horas).</p>
      <ol style="margin:0 0 12px;padding-left:18px;color:#d8e2ea;font-size:12.5px;line-height:1.7"><li>Copia el enlace.</li><li>Abre Google Calendar → <b>Otros calendarios ＋</b> → <b>Desde URL</b>.</li><li>Pega el enlace y pulsa <b>Añadir calendario</b>.</li></ol>
      <div style="display:flex;gap:8px"><input readonly value="${esc(feed)}" style="flex:1;min-width:0;background:#0a1829;border:1px solid #8ec3ee47;color:#f3f1ea;border-radius:9px;padding:9px 11px;font-size:12px" id="gc-url"><button type="button" id="gc-copy" style="border:1px solid #f3da8f;background:linear-gradient(135deg,#f2d27e,#cf9f3f);color:#1f1606;border-radius:9px;padding:8px 14px;font-weight:700;cursor:pointer">Copiar</button></div>
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:16px"><a href="https://calendar.google.com/calendar/r/settings/addbyurl" target="_blank" rel="noopener" style="border:1px solid #8ec3ee47;background:#0c1c2e;color:#f3f1ea;border-radius:9px;padding:8px 14px;font-weight:700;text-decoration:none;font-size:13px">Abrir Google Calendar ↗</a><button type="button" id="gc-close" style="border:1px solid #8ec3ee47;background:#0c1c2e;color:#f3f1ea;border-radius:9px;padding:8px 14px;font-weight:700;cursor:pointer">Cerrar</button></div></div>`;
    document.body.appendChild(bg);
    const close = () => bg.remove();
    bg.addEventListener("mousedown", (e) => { if (e.target === bg) close(); });
    bg.querySelector("#gc-close").onclick = close;
    bg.querySelector("#gc-copy").onclick = async () => {
      const input = bg.querySelector("#gc-url");
      try { await navigator.clipboard.writeText(feed); } catch (e) { input.select(); document.execCommand("copy"); }
      bg.querySelector("#gc-copy").textContent = "¡Copiado!";
    };
  }
  window.JarvisGcal = { open };
})();
