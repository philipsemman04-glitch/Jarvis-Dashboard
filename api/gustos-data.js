const { queryDatabase, getTitle, getRichText, getSelect, getNumber, getCheckbox, getDate } = require("./_notion");

/**
 * Database IDs — confirmed against the real workspace schema on Aug 11.
 * Override any of these in Vercel → Settings → Environment Variables if
 * Aurelio's workspace structure changes.
 */
const DB_LEARNING = process.env.NOTION_DB_LEARNING || "6e5a2bcc-cf58-4c45-93b1-e29f10ee57db"; // "📚 Learning Library"
const DB_GOALS = process.env.NOTION_DB_GOALS || "9644905b-74ff-4949-8671-c2ceaab319c5"; // "🎯 Personal Goals"
// "Habits" is intentionally NOT the plain "Habits" database — per Aurelio's own
// Workspace Spec doc, the real, richer habit log is "Rutina — Registro Diario"
// (one row per activity per day, with per-activity structured notes). Preserve
// that structure rather than flattening it into a generic streak counter.
const DB_RUTINA = process.env.NOTION_DB_HABITS || "c8928c8a-b6ba-41ee-8972-d001cc13d61e"; // "Rutina — Registro Diario"

module.exports = async (req, res) => {
  try {
    // ---- Learning Library ----
    let library = [];
    let topicCounts = {};
    if (DB_LEARNING) {
      const pages = await queryDatabase(DB_LEARNING, {});
      library = pages.map((p) => {
        const props = p.properties;
        const topics = (props["Topics"]?.multi_select || []).map((t) => t.name);
        topics.forEach((t) => (topicCounts[t] = (topicCounts[t] || 0) + 1));
        return {
          id: p.id,
          title: getTitle(props, "Title"),
          type: getSelect(props, "Type"),
          status: props["Status"]?.status?.name || null,
          topics,
          summary: getRichText(props, "Summary"),
        };
      });
    }

    const typeCounts = {};
    library.forEach((l) => {
      if (l.type) typeCounts[l.type] = (typeCounts[l.type] || 0) + 1;
    });
    const biblioteca = Object.entries(typeCounts).map(([label, value]) => ({ label, value }));

    // ---- Personal Goals ----
    let metasAprendizaje = [];
    if (DB_GOALS) {
      const pages = await queryDatabase(DB_GOALS, {
        filter: { property: "Area", select: { equals: "Learning" } },
      });
      metasAprendizaje = pages.map((p) => ({
        label: getTitle(p.properties, "Goal"),
        pct: Math.round((getNumber(p.properties, "Progress") || 0) * 100),
        nextAction: getRichText(p.properties, "Next Action"),
        status: p.properties["Status"]?.status?.name || null,
      }));
    }

    // ---- Rutina — Registro Diario (real habit log) ----
    let rutina = [];
    let racha = 0;
    if (DB_RUTINA) {
      const pages = await queryDatabase(DB_RUTINA, {
        sorts: [{ property: "Fecha", direction: "descending" }],
      });
      rutina = pages.map((p) => ({
        id: p.id,
        registro: getTitle(p.properties, "Registro"),
        actividad: getSelect(p.properties, "Actividad"),
        fecha: getDate(p.properties, "Fecha"),
        duracion: getNumber(p.properties, "Duración (min)"),
        nota: getRichText(p.properties, "Nota rápida"),
        hecho: getCheckbox(p.properties, "Hecho"),
      }));
      const doneDates = [...new Set(rutina.filter((r) => r.hecho && r.fecha).map((r) => r.fecha))].sort().reverse();
      let cursor = new Date();
      for (const d of doneDates) {
        const diffDays = Math.round((cursor - new Date(d)) / 86400000);
        if (diffDays > 1) break;
        racha++;
        cursor = new Date(d);
      }
    }

    res.status(200).json({
      source: DB_LEARNING ? "notion-live" : "not-configured",
      fetchedAt: new Date().toISOString(),
      stats: {
        areasExploradas: Object.keys(topicCounts).length || undefined,
        contenidoGuardado: library.length || undefined,
      },
      biblioteca: biblioteca.length ? biblioteca : undefined,
      nubeTemas: Object.entries(topicCounts).map(([word, weight]) => ({ word, weight })),
      library,
      metasAprendizaje: metasAprendizaje.length ? metasAprendizaje : undefined,
      rutinaReciente: rutina.slice(0, 10),
      rachaAprendizaje: racha,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
