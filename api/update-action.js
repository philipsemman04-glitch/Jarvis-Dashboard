const { updatePage } = require("./_notion");

/**
 * POST /api/update-action
 * Body: { pageId: "<notion page id>", status: "En progreso" | "Terminado" | ... }
 *
 * Used by the "Do Now" button and any other UI control that changes a
 * Master Actions row's status directly from the dashboard.
 *
 * FIX (Aug 15, round 3): now stamps "Completion Date" to today whenever
 * status becomes "Terminado" — needed so the Personal OS / Tasks &
 * Projects "completed recently" and date-filtered completed views have a
 * real date to sort and filter by, not just a status flip with no
 * timestamp.
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
    const properties = { Status: { select: { name: status } } };
    if (status === "Terminado") {
      properties["Completion Date"] = { date: { start: new Date().toISOString().slice(0, 10) } };
    }
    const result = await updatePage(pageId, properties);
    res.status(200).json({ ok: true, pageId: result.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
