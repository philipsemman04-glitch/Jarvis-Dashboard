const { createPage } = require("./_notion");

/**
 * POST /api/capture
 * Body: { type: "book"|"podcast"|"idea"|"note"|"reference", text: string }
 *
 * FIX (Aug 15): now creates a real row in Referencias (Aurelio's actual
 * knowledge-library database) instead of whatever demo database this
 * pointed at before. Only "Referencia" (title) and "Tipo" get set from a
 * quick-capture — Tema, Aplicar a, and "Por qué me interesa" are left for
 * Aurelio (or Claude, conversationally) to fill in afterward directly in
 * Notion or via the dashboard's fuller add-reference form.
 */
const DB_REFERENCIAS = process.env.NOTION_DB_REFERENCIAS || "7456b43c-50ef-4e15-bea4-ab2f824add71";

const TYPE_TO_TIPO = {
  book: "Libro",
  podcast: "Podcast",
  idea: "Idea / Concepto",
  note: "Idea / Concepto",
  reference: "Referencia visual",
};

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Use POST" });
    return;
  }
  try {
    const { type, text } = req.body || {};
    if (!text || !text.trim()) {
      res.status(400).json({ error: "text is required" });
      return;
    }

    const properties = {
      Referencia: { title: [{ text: { content: text.trim() } }] },
      Estado: { select: { name: "Por consumir" } },
    };
    const tipo = TYPE_TO_TIPO[type];
    if (tipo) {
      properties["Tipo"] = { select: { name: tipo } };
    }

    const page = await createPage(DB_REFERENCIAS, properties);
    res.status(200).json({ ok: true, pageId: page.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
