/*
 * One set of task rules for every Jarvis page (One Night Guest, project boards,
 * Tareas & Proyectos), so the same Notion data always gives the same numbers.
 *
 *  - Activa     = any status except "Terminado" and "Cancelado" (Bloqueado included).
 *  - Terminada  = "Terminado". "Cancelado" is counted apart, never as active or done.
 *  - Prioridad  = the Notion "Priority" field (P0–P4). "Priority Level" is kept in
 *                 sync on save but never read: almost no task has it filled in.
 *  - Periodo    = "Total" (default) shows every task. "Semana" / "Mes" show the
 *                 work of that period: tasks *created* in it, plus tasks
 *                 *finished* in it (by their Completion Date). Due dates are not
 *                 used — most tasks have none. A finished task without a
 *                 Completion Date that was created before the period can't be
 *                 placed in it, so it only counts in "Total".
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
  const isTotal = period => !period || period === "total" || period === "all";
  // period: "total" | "month" | "lastmonth" | "week" (week starts on Monday).
  function inPeriod(dateISO, period) {
    if (isTotal(period)) return true;
    if (!dateISO) return false;
    const now = new Date();
    if (period === "month") return dateISO.slice(0, 7) === localISO(now).slice(0, 7);
    if (period === "lastmonth") return dateISO.slice(0, 7) === localISO(new Date(now.getFullYear(), now.getMonth() - 1, 1)).slice(0, 7);
    const start = new Date(now); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    const end = new Date(start); end.setDate(start.getDate() + 7);
    return dateISO >= localISO(start) && dateISO < localISO(end);
  }
  const PERIOD_LABEL = { total: "en total", all: "en total", month: "este mes", lastmonth: "el mes pasado", week: "esta semana" };

  const createdIn = (t, period) => inPeriod(t.createdOn, period);
  // Finished in the period: by its Completion Date; or, with no date, if it was
  // created in the period — a task created this week and already finished was
  // necessarily finished this week. Otherwise the finish day is unknown.
  const finishedIn = (t, period) => isDone(t) && (t.completedOn ? inPeriod(t.completedOn, period) : createdIn(t, period));
  const finishUnknown = (t, period) => isDone(t) && !t.completedOn && !createdIn(t, period);
  // Does this task belong to the selected period? (Total: always.) Finished
  // tasks by when they were finished; all others by when they were created.
  function taskInPeriod(t, period) {
    return isTotal(period) || (isDone(t) ? finishedIn(t, period) : createdIn(t, period));
  }

  // Every count a page shows, from one pass over the tasks. Priority boxes and
  // "done" count the tasks of the period; total/active/cancelled/progress
  // describe the whole project (the Notion totals) whatever the period.
  function summarize(tasks, period) {
    const s = { total: tasks.length, active: 0, done: 0, cancelled: 0, inView: 0, createdInPeriod: 0, doneInPeriod: 0, doneUndated: 0, P0: 0, P1: 0, P2: 0, P3: 0, P4: 0, none: 0 };
    tasks.forEach(t => {
      const inView = taskInPeriod(t, period);
      if (inView) s.inView++;
      if (!isTotal(period) && createdIn(t, period)) s.createdInPeriod++;
      if (isDone(t)) {
        s.done++;
        if (!isTotal(period) ? finishUnknown(t, period) : !t.completedOn) s.doneUndated++;
        if (isTotal(period) || finishedIn(t, period)) s.doneInPeriod++;
        return;
      }
      if (isCancelled(t)) { s.cancelled++; return; }
      s.active++;
      if (inView) s[priorityOf(t) || "none"]++;
    });
    s.low = s.P3 + s.P4 + s.none; // "Baja" box: P3, P4 (Futuro) and tasks with no priority
    s.progress = s.total - s.cancelled ? Math.round((s.done / (s.total - s.cancelled)) * 100) : 0;
    s.isTotal = isTotal(period);
    return s;
  }

  // The line under the KPI boxes that shows the numbers add up to Notion's total.
  function reconcileText(s, period) {
    const totals = `${s.total} tareas en Notion = ${s.active} activas + ${s.done} terminadas + ${s.cancelled} canceladas`;
    const parts = [`P0 ${s.P0}`, `P1 ${s.P1}`, `P2 ${s.P2}`, `P3 ${s.P3}`, `P4 ${s.P4}`];
    if (s.none) parts.push(`sin prioridad ${s.none}`);
    if (s.isTotal) return `${totals} · Activas por prioridad: ${parts.join(" · ")}`;
    const undated = s.doneUndated ? ` · ${s.doneUndated} terminadas antes de este periodo sin fecha de término solo cuentan en Total` : "";
    return `${PERIOD_LABEL[period].replace(/^./, c => c.toUpperCase())}: ${s.createdInPeriod} creadas y ${s.doneInPeriod} terminadas — mostrando ${s.inView} de ${s.total} · ${totals}${undated}`;
  }

  window.JarvisTasks = { PRIORITIES, LABEL, LEVEL_FOR, PERIOD_LABEL, isDone, isCancelled, isActive, priorityOf, priorityName, inPeriod, taskInPeriod, summarize, reconcileText };
})();
