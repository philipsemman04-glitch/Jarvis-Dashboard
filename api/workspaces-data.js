const { queryDatabase, getTitle, getRichText, getSelect, getNumber } = require("./_notion");

/**
 * GET /api/workspaces-data
 *
 * Reads the "🗂️ Workspaces" database — the single editable source for the
 * Jarvis Home screen. Aurelio can add/edit/reorder workspaces directly in
 * Notion (name, icon, description, stat, route, color, status) and this
 * endpoint reflects it immediately, no code changes needed.
 */
const DB_WORKSPACES = process.env.NOTION_DB_WORKSPACES || "0c06b31c-8503-4cf6-85cb-65884d7e7a26";

module.exports = async (req, res) => {
  try {
    const pages = await queryDatabase(DB_WORKSPACES, {
      sorts: [{ property: "Order", direction: "ascending" }],
    });

    const workspaces = pages.map((p) => {
      const props = p.properties;
      return {
        id: p.id,
        notionUrl: p.url,
        name: getTitle(props, "Name"),
        icon: getRichText(props, "Icon") || "📁",
        description: getRichText(props, "Description"),
        statLabel: getRichText(props, "Stat Label") || null, // null → front-end shows "No data yet"
        statTrend: getRichText(props, "Stat Trend") || null,
        route: props["Route"]?.url || null,
        accentColor: getSelect(props, "Accent Color") || "Gray",
        type: getSelect(props, "Type") || "Business",
        status: getSelect(props, "Status") || "Coming soon",
        order: getNumber(props, "Order") ?? 999,
      };
    });

    res.status(200).json({
      source: "notion-live",
      fetchedAt: new Date().toISOString(),
      workspaces,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
