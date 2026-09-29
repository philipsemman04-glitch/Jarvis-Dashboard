/*
 * One set of task rules for every Jarvis page (One Night Guest, project boards,
 * Tareas & Proyectos), so the same Notion data always gives the same numbers.
 *
 *  - Activa     = any status except "Terminado" and "Cancelado" (Bloqueado included).
 *  - Terminada  = "Terminado". "Cancelado" is counted apart, never as active or done.
 *  - Prioridad  = the Notion "Priority" field (P0–P4). "Priority Level" is kept in
 *                 sync on save but never read: almost no task has it filled in.
 *  - Periodo    = only filters *finished* tasks, by the day they were finished
 *                 (`completedOn` from the API). Open tasks are never hidden by
 *                 date — most have no due date.
 */
(function () {
  const PRIORITIES = [
    { key: "P0", label: "Crítica" },
    { key: "P1", label: "Alta" },
    { key: "P2", label: "Media" },
    { key: "P3", label: "Baja" },
    { key: "P4", label: "Futuro" },
  ];
  const LABEL = Object.fromEntries(PRIORITIES.map(p => [p.key, p.label]));
  // Priority Level (Critical/High/Medium/Low) written alongside Priority so
  // Notion views that group by it stay consistent.
  const LEVEL_FOR = { P0: "Critical", P1: "High", P2: "Medium", P3: "Low", P4: "Low" };

  const isDone = t => t.status === "Terminado";
  const isCancelled = t => t.status === "Cancelado";
  const isActive = t => !isDone(t) && !isCancelled(t);
  const priorityOf = t => (/^P[0-4]$/.test(t.priority || "") ? t.priority : "");
  const priorityName = t => { const p = priorityOf(t); return p ? `${p} · ${LABEL[p]}` : "Sin prioridad"; };

  function localISO(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  // period: "total" | "month" | "week" (week starts on Monday).
  function inPeriod(dateISO, period) {
    if (!period || period === "total" || period === "all") return true;
    if (!dateISO) return false;
    const now = new Date();
    if (period === "month") return dateISO.slice(0, 7) === localISO(now).slice(0, 7);
    const start = new Date(now); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    const end = new Date(start); end.setDate(start.getDate() + 7);
    return dateISO >= localISO(start) && dateISO < localISO(end);
  }
  const PERIOD_LABEL = { total: "en total", all: "en total", month: "este mes", week: "esta semana" };

  // Every count a page shows, from one pass over the tasks.
  function summarize(tasks, period) {
    const s = { total: tasks.length, active: 0, done: 0, cancelled: 0, doneInPeriod: 0, P0: 0, P1: 0, P2: 0, P3: 0, P4: 0, none: 0 };
    tasks.forEach(t => {
      if (isDone(t)) { s.done++; if (inPeriod(t.completedOn, period)) s.doneInPeriod++; return; }
      if (isCancelled(t)) { s.cancelled++; return; }
      s.active++;
      s[priorityOf(t) || "none"]++;
    });
    s.low = s.P3 + s.P4 + s.none; // "Baja" box: P3, P4 (Futuro) and tasks with no priority
    s.progress = s.total - s.cancelled ? Math.round((s.done / (s.total - s.cancelled)) * 100) : 0;
    return s;
  }

  // The line under the KPI boxes that shows the numbers add up to Notion's total.
  function reconcileText(s) {
    const parts = [`P0 ${s.P0}`, `P1 ${s.P1}`, `P2 ${s.P2}`, `P3 ${s.P3}`, `P4 ${s.P4}`];
    if (s.none) parts.push(`sin prioridad ${s.none}`);
    return `${s.total} tareas en Notion = ${s.active} activas + ${s.done} terminadas + ${s.cancelled} canceladas · Activas por prioridad: ${parts.join(" · ")}`;
  }

  window.JarvisTasks = { PRIORITIES, LABEL, LEVEL_FOR, PERIOD_LABEL, isDone, isCancelled, isActive, priorityOf, priorityName, inPeriod, summarize, reconcileText };
})();
