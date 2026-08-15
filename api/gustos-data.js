const { queryDatabase, getTitle, getRichText, getSelect, getNumber, getCheckbox, getDate } = require("./_notion");

/**
 * Database IDs.
 *
 * FIX (Aug 15): repointed from "📚 Learning Library" (a demo database with
 * 3 sample rows and a fixed 6-option topic list) to "Referencias" — the
 * database Aurelio actually built for this: Tipo, Tema (multi-select,
 * extensible), Aplicar a, Enlace, Estado, "Por qué me interesa". It has 0
 * rows right now, which is correct — every stat below is computed from
 * whatever's actually there, so it starts at honest zeros and grows as
 * Aurelio (or Claude, writing directly into this database) adds real
 * references. Nothing here is backfilled with a fallback number.
 */
const DB_REFERENCIAS = process.env.NOTION_DB_REFERENCIAS || "7456b43c-50ef-4e15-bea4-ab2f824add71";
const DB_GOALS = process.env.NOTION_DB_GOALS || "9644905b-74ff-4949-8671-c2ceaab319c5"; // "🎯 Personal Goals"
const DB_RUTINA = process.env.NOTION_DB_HABITS || "c8928c8a-b6ba-41ee-8972-d001cc13d61e"; // "Rutina — Registro Diario"

function getMultiSelect(props, key) {
  return (props[key]?.multi_select || []).map((o) => o.name);
}
function getUrl(props, key) {
  return props[key]?.url || null;
}

module.exports = async (req, res) => {
  try {
    // ---- Referencias: the real knowledge/reference library ----
    const pages = await queryDatabase(DB_REFERENCIAS, {
      sorts: [{ property: "Referencia", direction: "ascending" }],
    });

    const referencias = pages.map((p) => ({
      id: p.id,
      notionUrl: p.url,
      referencia: getTitle(p.properties, "Referencia"),
      tipo: getSelect(p.properties, "Tipo"),
      temas: getMultiSelect(p.properties, "Tema"),
      aplicarA: getMultiSelect(p.properties, "Aplicar a"),
      enlace: getUrl(p.properties, "Enlace"),
      estado: getSelect(p.properties, "Estado"),
      porQueMeInteresa: getRichText(p.properties, "Por qué me interesa"),
      createdTime: p.created_time,
    }));

    // ---- Real computed stats — every number here comes from the rows above ----
    const temaCounts = {};
    const tipoCounts = {};
    const estadoCounts = {};
    referencias.forEach((r) => {
      r.temas.forEach((t) => (temaCounts[t] = (temaCounts[t] || 0) + 1));
      if (r.tipo) tipoCounts[r.tipo] = (tipoCounts[r.tipo] || 0) + 1;
      if (r.estado) estadoCounts[r.estado] = (estadoCounts[r.estado] || 0) + 1;
    });

    const biblioteca = Object.entries(tipoCounts).map(([label, value]) => ({ label, value }));
    const temasExplorados = Object.entries(temaCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
    const nubeTemas = temasExplorados.map((t) => ({ word: t.name, weight: t.count }));

    // Most recent additions, by type, for the "recientes" panels
    const recentByTipo = (tipo, n) =>
      referencias
        .filter((r) => r.tipo === tipo)
        .sort((a, b) => new Date(b.createdTime) - new Date(a.createdTime))
        .slice(0, n)
        .map((r) => ({ title: r.referencia, meta: r.porQueMeInteresa || "", enlace: r.enlace }));

    // ---- Personal Goals tagged "Learning" (unchanged — this part was already correct) ----
    let metasAprendizaje = [];
    if (DB_GOALS) {
      const goalPages = await queryDatabase(DB_GOALS, {
        filter: { property: "Area", select: { equals: "Learning" } },
      });
      metasAprendizaje = goalPages.map((p) => ({
        label: getTitle(p.properties, "Goal"),
        pct: Math.round((getNumber(p.properties, "Progress") || 0) * 100),
        nextAction: getRichText(p.properties, "Next Action"),
        status: p.properties["Status"]?.status?.name || null,
      }));
    }

    // ---- Rutina — Registro Diario: real habit-streak logic (unchanged, unrelated to this fix) ----
    let racha = 0;
    if (DB_RUTINA) {
      const rutinaPages = await queryDatabase(DB_RUTINA, {
        sorts: [{ property: "Fecha", direction: "descending" }],
      });
      const rutina = rutinaPages.map((p) => ({
        hecho: getCheckbox(p.properties, "Hecho"),
        fecha: getDate(p.properties, "Fecha"),
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
      source: "notion-live",
      fetchedAt: new Date().toISOString(),
      stats: {
        referenciasGuardadas: referencias.length,
        temasExplorados: temasExplorados.length,
        porConsumir: estadoCounts["Por consumir"] || 0,
        terminado: estadoCounts["Terminado"] || 0,
      },
      referencias,
      biblioteca,
      temasExplorados,
      nubeTemas,
      librosRecientes: recentByTipo("Libro", 3),
      podcastsRecientes: recentByTipo("Podcast", 3),
      ideasRecientes: recentByTipo("Idea / Concepto", 5),
      metasAprendizaje,
      rachaAprendizaje: racha,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
