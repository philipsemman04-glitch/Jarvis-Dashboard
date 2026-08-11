const { createPage } = require("./_notion");

/**
 * POST /api/capture
 * Body: { type: "idea" | "book" | "podcast" | "note" | "reference", text: "..." }
 *
 * Writes into "📚 Learning Library" — confirmed schema (Aug 11):
 *   Title (title), Type (select: Book/Podcast/Course/Conference/Article/Note),
 *   Topics (multi_select), Status (status), Summary (text), Source Link (url).
 * There's no "Idea" option in Type, so idea/note both map to "Note" — the
 * closest real category rather than inventing a new select option silently.
 */
const DB_LEARNING = process.env.NOTION_DB_LEARNING || "6e5a2bcc-cf58-4c45-93b1-e29f10ee57db";

const TYPE_MAP = {
  book: "Book",
  podcast: "Podcast",
  idea: "Note",
  note: "Note",
  reference: "Article",
};

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Use POST" });
    return;
  }
  try {
    const { type, text } = req.body || {};
    const notionType = TYPE_MAP[type];
    if (!notionType) {
      res.status(400).json({ error: `Unknown capture type: ${type}` });
      return;
    }
    if (!text || !text.trim()) {
      res.status(400).json({ error: "text is required" });
      return;
    }
    if (!DB_LEARNING) {
      res.status(400).json({ error: "NOTION_DB_LEARNING is not set." });
      return;
    }

    const page = await createPage(DB_LEARNING, {
      Title: { title: [{ text: { content: text.trim() } }] },
      Type: { select: { name: notionType } },
      Status: { status: { name: "To consume" } },
    });
    res.status(200).json({ ok: true, pageId: page.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
