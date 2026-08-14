const {
  queryDatabase,
  getTitle,
  getRichText,
  getSelect,
  getCheckbox,
  getNumber,
  getDate,
} = require("./_notion");

/**
 * Database IDs — confirmed against the real workspace schema on Aug 11.
 * Override any of these in Vercel → Settings → Environment Variables.
 */
const DB_ACTIONS = process.env.NOTION_DB_ACTIONS || "de671725-0aef-44f7-9ec4-a577b1c7e254";
const DB_DECISIONS = process.env.NOTION_DB_DECISIONS || "50b48347-9a7f-48a2-8876-ed3381a285ab";
const DB_BUDGET = process.env.NOTION_DB_BUDGET || "413469f4-5f82-47d3-9f23-fed8fd6ff4d4";
const DB_CRM_LEADS = process.env.NOTION_DB_CRM_LEADS || "3b43ee78-69f9-4ccf-9f18-25c0f220b398";
const PROJECT_ONG_ID = process.env.NOTION_PROJECT_ONG_ID || "3b864152-b99e-814b-9c4c-f8cefe66c574";

module.exports = async (req, res) => {
  try {
    // ---- Master Actions for this project ----
    // FIX (Aug 14): this used to filter on "Project Rel" (a relation to the
    // Projects database), but that relation is only populated on 127 of 216
    // rows workspace-wide — 89 real ONG tasks are tagged via the simpler
    // "Project" select field only and have no "Project Rel" at all, so they
    // were silently excluded from every count below. "Project" (select) is
    // the reliably-populated field — confirmed 187 rows tagged "One Night
    // Guest" there vs 127 with any Project Rel set. Filtering on select.
    const actionPages = await queryDatabase(DB_ACTIONS, {
      filter: { property: "Project", select: { equals: "One Night Guest" } },
      sorts: [{ property: "Priority", direction: "ascending" }],
    });

    const actions = actionPages.map((p) => {
      const props = p.properties;
      return {
        id: p.id,
        taskName: getTitle(props, "Task Name"),
        status: getSelect(props, "Status"),
        priority: getSelect(props, "Priority"),
        blocksLaunch: getCheckbox(props, "Blocks Launch"),
        nextAction: getRichText(props, "Next Action"),
        completionCriteria: getRichText(props, "Completion Criteria"),
        targetDate: getDate(props, "Target Date"),
      };
    });

    const critical = actions.filter((a) => a.priority === "P0" && a.status !== "Terminado").length;
    const onTrack = actions.filter((a) => a.status === "En progreso").length;

    const nextActionRow =
      actions.find((a) => a.blocksLaunch && a.status !== "Terminado" && a.priority === "P0") ||
      actions.find((a) => a.status !== "Terminado" && a.priority === "P0") ||
      null;

    // ---- Decisions awaiting input ----
    // Status here is a `status` type (Pending / Under review / Decided / Reversed),
    // NOT a plain select — Notion's filter API needs the matching "status" filter
    // shape. Area is a `relation` to Master Entities, not text — we don't resolve
    // the related entity's name here to avoid an extra round-trip per row; the
    // dashboard just shows the decision title.
    let decisionsOpen = [];
    try {
      const decisionPages = await queryDatabase(DB_DECISIONS, {
        filter: {
          or: [
            { property: "Status", status: { equals: "Pending" } },
            { property: "Status", status: { equals: "Under review" } },
          ],
        },
      });
      decisionsOpen = decisionPages.map((p) => ({
        id: p.id,
        title: getTitle(p.properties, "Decision"),
      }));
    } catch (e) {
      /* Decisions DB may not be shared yet — degrade gracefully */
    }

    // ---- Budget / KPIs: pull MRR if present ----
    // "Item Name" is a `title` property — filter with `title.contains`, not rich_text.
    // Confirmed Aug 14: no row with "MRR" in its title exists yet, so this
    // correctly returns null and the dashboard shows "No data yet" for MRR
    // rather than a number — do not hardcode a fallback value here.
    let mrrActual = null;
    try {
      const budgetPages = await queryDatabase(DB_BUDGET, {
        filter: { property: "Item Name", title: { contains: "MRR" } },
      });
      if (budgetPages[0]) {
        mrrActual = getNumber(budgetPages[0].properties, "Actual");
      }
    } catch (e) {
      /* Budget DB may not be shared yet */
    }

    // ---- CRM Leads: total count + funnel stage breakdown ----
    // "Funnel Stage" is confirmed `select` with 8 stages from Captured → Paid/Abandoned.
    // FIX (Aug 14): this database still holds 3 seeded rows from initial setup,
    // titled "[SAMPLE] ..." (e.g. "[SAMPLE] DJ Nova") — confirmed real, not yet
    // deleted (deletion needs a manual check of each DB's automations first,
    // per the note on the Funnels/CRM page). Excluding them here by title
    // prefix so they never inflate totalLeads or the funnel counts, regardless
    // of whether/when the manual cleanup happens.
    let totalLeads = null;
    let funnel = [];
    try {
      const leadPages = await queryDatabase(DB_CRM_LEADS, {});
      const realLeadPages = leadPages.filter((p) => !getTitle(p.properties, "Lead Name").startsWith("[SAMPLE]"));
      totalLeads = realLeadPages.length;
      const stageCounts = {};
      realLeadPages.forEach((p) => {
        const stage = getSelect(p.properties, "Funnel Stage") || "Unknown";
        stageCounts[stage] = (stageCounts[stage] || 0) + 1;
      });
      funnel = Object.entries(stageCounts).map(([stage, count]) => ({ stage, count }));
    } catch (e) {
      /* CRM Leads DB may not be shared yet */
    }

    res.status(200).json({
      source: "notion-live",
      fetchedAt: new Date().toISOString(),
      project: { name: "One Night Guest", shortName: "ONG" },
      stats: {
        critical,
        decisions: decisionsOpen.length,
        onTrack,
        mrrActual: mrrActual ?? undefined,
        totalLeads: totalLeads ?? undefined,
        leadsPeriod: "Live from Notion",
      },
      nextAction: nextActionRow
        ? {
            id: nextActionRow.id,
            taskName: nextActionRow.taskName,
            blocksLaunch: nextActionRow.blocksLaunch,
            dueLabel: nextActionRow.targetDate ? `Due ${nextActionRow.targetDate}` : "No date set",
            impact: 90,
            why: nextActionRow.nextAction || nextActionRow.completionCriteria || "",
          }
        : null,
      blockersAndDecisions: [
        ...actions
          .filter((a) => a.status === "Bloqueado")
          .map((a) => ({ title: a.taskName, type: "Blocked", severity: "critical", area: "" })),
        ...decisionsOpen.map((d) => ({ title: d.title, type: "Decision", severity: "decision", area: "" })),
      ],
      funnel,
      allActions: actions,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
