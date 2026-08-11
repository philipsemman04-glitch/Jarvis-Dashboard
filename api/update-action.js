const { updatePage } = require("./_notion");

/**
 * POST /api/update-action
 * Body: { pageId: "<notion page id>", status: "En progreso" | "Terminado" | ... }
 *
 * Used by the "Do Now" button and any other UI control that changes a
 * Master Actions row's status directly from the dashboard.
 */
module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Use POST" });
    return;
  }
  try {
    const { pageId, status } = req.body || {};
    if (!pageId || !status) {
      res.status(400).json({ error: "pageId and status are required" });
      return;
    }
    const result = await updatePage(pageId, {
      Status: { select: { name: status } },
    });
    res.status(200).json({ ok: true, pageId: result.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
